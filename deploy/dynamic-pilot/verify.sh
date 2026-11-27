#!/usr/bin/env bash
set -euo pipefail
umask 077

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
source_sha=$(git -C "$repo" rev-parse --verify "${1:-HEAD}^{commit}")
git -C "$repo" grep -q APP_BIND_ADDRESS "$source_sha" -- starters/app-admin/config.mjs

node_image=node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd
edge_image=nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
host=dynamic-check.app.bapx.in
origin="https://$host:8443"
work=$(mktemp -d "${TMPDIR:-/tmp}/bapx-dynamic-hosting.XXXXXXXX")
suffix=${work##*.}
project="bapx-dynamic-${suffix,,}"
network="$project-edge"
data="$project-data"
fixture="$project-fixture"
edge="$project-proxy"
app=
image="$project:check"

cleanup() {
    local status=$?
    if (( status )); then
        if [[ -n "$app" ]]; then docker logs "$app" >&2 || true; fi
        if docker inspect "$edge" >/dev/null 2>&1; then docker logs "$edge" >&2 || true; fi
    fi
    if [[ -n "$app" ]]; then docker rm -f "$app" >/dev/null 2>&1 || true; fi
    docker rm -f "$edge" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir "$work/source" "$work/tls"
git -C "$repo" archive "$source_sha" starters/app-admin |
    tar --same-permissions --no-same-owner -xf - -C "$work/source"
docker build --file "$here/Dockerfile" --build-arg "SOURCE_SHA=$source_sha" --tag "$image" "$work/source"
image_id=$(docker image inspect --format '{{.Id}}' "$image")
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id")" = "$source_sha"

openssl req -new -newkey rsa:2048 -noenc -x509 -days 1 -subj "/CN=$host" \
    -addext "subjectAltName=DNS:$host" -keyout "$work/tls/key.pem" -out "$work/tls/cert.pem" 2>/dev/null
chmod 0755 "$work/tls"
chmod 0444 "$work/tls/"{cert,key}.pem
docker network create --internal "$network" >/dev/null
docker volume create "$data" >/dev/null
docker volume create "$fixture" >/dev/null
docker run --rm --network none --mount "type=volume,source=$fixture,target=/fixture-data" \
    "$node_image" sh -ec 'chown 1000:1000 /fixture-data && chmod 0700 /fixture-data'

hardened=(--network "$network" --read-only --cap-drop ALL --security-opt no-new-privileges \
    --memory 256m --cpus .5 --pids-limit 64)
docker run -d --name "$edge" --network-alias edge --user 101:101 "${hardened[@]}" \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m \
    --mount "type=bind,src=$work/tls,dst=/tls,readonly" \
    --mount "type=bind,src=$here/nginx.conf,dst=/nginx.conf,readonly" \
    --entrypoint nginx "$edge_image" -c /nginx.conf -g 'daemon off;' >/dev/null

start() {
    app="$project-app-$1"
    docker run -d --name "$app" --network-alias app "${hardened[@]}" \
        --mount "type=volume,source=$data,target=/private" \
        --mount "type=volume,source=$fixture,target=/fixture-data" \
        --mount "type=bind,source=$here/fixture.mjs,target=/fixture.mjs,readonly" \
        -e APP_ID=dynamic-pilot -e APP_NAME='Isolated Dynamic Pilot' -e "APP_ORIGIN=$origin" \
        -e APP_DATA_DIR=/private -e APP_OWNER_EMAIL=owner@example.test \
        -e APP_EMAIL_FROM=sender@example.test -e APP_RESEND_API_KEY=fixture-only \
        -e APP_BIND_ADDRESS=0.0.0.0 -e NODE_OPTIONS=--import=/fixture.mjs \
        "$image_id" >/dev/null
    docker inspect "$edge" "$app" | jq -e --arg net "$network" '
        all(.[]; ((.HostConfig.PortBindings // {}) | length) == 0 and
        (.NetworkSettings.Networks | keys == [$net]))' >/dev/null
}

probe() {
    docker run --rm "${hardened[@]}" --user 1000:1000 -e "APP_ORIGIN=$origin" \
        --mount "type=volume,source=$fixture,target=/fixture-data" \
        --mount "type=bind,source=$work/tls/cert.pem,target=/tls/cert.pem,readonly" \
        --mount "type=bind,source=$here/probe.mjs,target=/probe.mjs,readonly" \
        "$node_image" node /probe.mjs "$1"
}

start 1
first=$(docker inspect --format '{{.Id}}' "$app")
probe seed
docker stop --time 10 "$app" >/dev/null
docker rm "$app" >/dev/null
start 2
second=$(docker inspect --format '{{.Id}}' "$app")
test "$first" != "$second"
probe after-replacement
printf 'Build SHA %s\nImage ID %s\nIsolated HTTPS %s/\nApp data volume %s\nFixture volume %s\n' \
    "$source_sha" "$image_id" "$origin" "$data" "$fixture" | tee "$work/verification.txt"
printf 'Private fixture evidence %s\n' "$work/verification.txt"
