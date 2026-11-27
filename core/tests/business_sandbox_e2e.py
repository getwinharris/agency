"""Exercise the loopback sandbox with disposable accounts, projects and volumes."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import select
import subprocess
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from tempfile import TemporaryDirectory
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener


WRITE_PROJECT = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const marker = process.argv[1];
const root = fs.readFileSync('/proc/mounts', 'utf8').split('\n').find(
  line => line.split(' ')[1] === '/'
);
assert(root.split(' ')[3].split(',').includes('ro'));
assert.equal(process.getuid(), 1000);
assert.deepEqual(Object.keys(process.env).sort(), ['HOME', 'PATH', 'TMPDIR']);
assert.deepEqual(Object.keys(os.networkInterfaces()), ['lo']);
assert.equal(process.cwd(), '/home/node');
assert.equal(fs.existsSync('/var/run/docker.sock'), false);
assert.equal(fs.existsSync('project.txt'), false);
assert.equal(fs.existsSync('/tmp/scratch.txt'), false);
fs.writeFileSync('project.txt', marker);
fs.writeFileSync('/tmp/scratch.txt', marker);
process.stdout.write(marker);
"""

READ_PROJECT = """
const assert = require('node:assert/strict');
const fs = require('node:fs');
assert.equal(fs.existsSync('/tmp/scratch.txt'), false);
process.stdout.write(fs.readFileSync('project.txt', 'utf8'));
"""


def docker(*args, socket):
    return subprocess.run(
        ["/usr/bin/docker", "--host", f"unix://{socket}", *args],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    ).stdout.strip()


def write_policy(path, policy):
    pending = path.with_suffix(".next")
    descriptor = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as out:
        json.dump(policy, out)
    pending.replace(path)


@contextmanager
def serve(binary, policy):
    process = subprocess.Popen(
        [str(binary), "serve-business-sandbox", str(policy)],
        env={"PATH": "/usr/bin:/bin", "BAPX_OPERATOR_FIXTURE_SECRET": "disposable-only"},
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        assert select.select([process.stderr], [], [], 15)[0], "sandbox server did not start"
        line = process.stderr.readline()
        address = re.fullmatch(r"bapx-business-sandbox listening on (127\.0\.0\.1:\d+)\n", line)
        assert address, f"sandbox server did not bind loopback: {line}"
        yield f"http://{address[1]}"
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        process.stderr.close()


def run(origin, token, business, project, argv):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(
        f"{origin}/v1/businesses/{business}/projects/{project}/run",
        json.dumps({"argv": argv}).encode(),
        headers,
        method="POST",
    )
    opener = build_opener(ProxyHandler({}))
    try:
        with opener.open(request, timeout=60) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        with error:
            return error.code, json.load(error)


def successful_job(reply, marker):
    status, body = reply
    assert status == 200 and body["exit_code"] == 0, f"authorized job failed: {status}, {body}"
    assert body["stdout"] == marker and not body["stderr"], body


def verify(binary, image, socket):
    installation = f"disposable-{secrets.token_hex(12)}"
    alice, bob = secrets.token_hex(32), secrets.token_hex(32)
    settings = {
        "installation": installation,
        "listen": "127.0.0.1:0",
        "image": image,
        "docker_socket": str(socket),
    }
    policy = {
        "settings": settings,
        "accounts": {
            "alice": hashlib.sha256(alice.encode()).hexdigest(),
            "bob": hashlib.sha256(bob.encode()).hexdigest(),
        },
        "businesses": {
            "alpha": {
                "members": ["alice"],
                "projects": {"notes": {"members": ["alice"]}, "restricted": {"members": []}},
            },
            "beta": {"members": ["bob"], "projects": {"notes": {"members": ["bob"]}}},
        },
    }
    label = f"label=com.bapx.sandbox.installation={installation}"
    try:
        with TemporaryDirectory(prefix="bapx-business-sandbox-") as temp:
            path = Path(temp) / "policy.json"
            write_policy(path, policy)
            with serve(binary, path) as origin:
                argv = ["/bin/true"]
                assert run(origin, None, "alpha", "notes", argv)[0] == 401
                assert run(origin, secrets.token_hex(32), "alpha", "notes", argv)[0] == 401
                absent = (404, {"error": "project not found"})
                assert run(origin, alice, "beta", "notes", argv) == absent
                assert run(origin, bob, "alpha", "notes", argv) == absent
                assert run(origin, alice, "alpha", "restricted", argv) == absent
                assert run(origin, alice, "alpha", "unknown", argv) == absent
                assert run(origin, alice, "alpha", "notes", [])[0] == 400
                assert not docker("volume", "ls", "-q", "--filter", label, socket=socket)
                with ThreadPoolExecutor(max_workers=2) as workers:
                    first = workers.submit(
                        run, origin, alice, "alpha", "notes", ["node", "-e", WRITE_PROJECT, "alpha"]
                    )
                    second = workers.submit(
                        run, origin, bob, "beta", "notes", ["node", "-e", WRITE_PROJECT, "beta"]
                    )
                    successful_job(first.result(), "alpha")
                    successful_job(second.result(), "beta")
                assert not docker("container", "ls", "-aq", "--filter", label, socket=socket)
                assert len(docker("volume", "ls", "-q", "--filter", label, socket=socket).splitlines()) == 2
                status, output = run(
                    origin, alice, "alpha", "notes", ["node", "-e", "process.exit(7)"]
                )
                assert status == 200 and output["exit_code"] == 7, (status, output)
                policy["businesses"]["alpha"]["members"] = []
                write_policy(path, policy)
                assert run(origin, alice, "alpha", "notes", argv) == absent
                policy["businesses"]["alpha"]["members"] = ["alice"]
                write_policy(path, policy)
            with serve(binary, path) as origin:
                successful_job(run(origin, alice, "alpha", "notes", ["node", "-e", READ_PROJECT]), "alpha")
                successful_job(run(origin, bob, "beta", "notes", ["node", "-e", READ_PROJECT]), "beta")
                limited = ["node", "-e", "process.stdout.write('x'.repeat(128 * 1024))"]
                status, output = run(origin, alice, "alpha", "notes", limited)
                assert status == 200 and output["truncated"] and len(output["stdout"]) == 64 * 1024
    finally:
        containers = docker("container", "ls", "-aq", "--filter", label, socket=socket).splitlines()
        if containers:
            docker("container", "rm", "-f", *containers, socket=socket)
        volumes = docker("volume", "ls", "-q", "--filter", label, socket=socket).splitlines()
        if volumes:
            docker("volume", "rm", *volumes, socket=socket)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--disposable", action="store_true")
    parser.add_argument("--binary", default="target/debug/cloudroom", type=Path)
    parser.add_argument("--image", default="node:24-alpine")
    parser.add_argument("--socket", default=Path("/var/run/docker.sock"), type=Path)
    args = parser.parse_args()
    if not args.disposable:
        parser.error("testing creates and removes labeled disposable Docker resources")
    image = docker("image", "inspect", "--format", "{{.Id}}", args.image, socket=args.socket)
    verify(args.binary.resolve(), image, args.socket)
    print(f"Disposable business sandbox checks passed with shared Linux image {image}.")


if __name__ == "__main__":
    main()
