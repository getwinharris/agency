#!/usr/bin/env bash
set -euo pipefail
umask 077

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export BAPX_SAMPLE_IMAGE=${1:?Pass the sample image}
revision=${2:?Pass the exact build SHA}
scratch=$(mktemp -d)
suffix=${scratch##*.}
project="bapx-sample-test-${suffix,,}"
ingress="${project}_ingress"
export BAPX_SAMPLE_OWNER_FILE="$scratch/owner-password"

compose() {
    docker compose --project-name "$project" -f "$scratch/bundle/compose.yml" "$@"
}

cleanup() {
    local result=$?
    if (( result != 0 )); then compose logs --no-color >&2 || true; fi
    compose down --volumes >/dev/null 2>&1 || true
    rm -f -- "$scratch/owner-password" "$scratch/proof.json"
    if [[ -d $scratch/bundle ]]; then
        rm -f -- "$scratch/bundle/"{compose.yml,nginx.conf}
        rmdir "$scratch/bundle"
    fi
    rmdir "$scratch"
}
trap cleanup EXIT

openssl rand -hex 32 > "$BAPX_SAMPLE_OWNER_FILE"
chmod 0444 "$BAPX_SAMPLE_OWNER_FILE"
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$BAPX_SAMPLE_IMAGE")" = "$revision"

mkdir "$scratch/bundle"
cp -- "$here/compose.yml" "$scratch/bundle/"
install -m 0444 -- "$here/nginx.conf" "$scratch/bundle/nginx.conf"
test "$(stat -c %a "$scratch/bundle/nginx.conf")" = 444

compose pull edge
compose up -d --pull never
docker inspect "$(compose ps -q app)" | jq -e --arg network "${project}_private" '
    .[0] | (.NetworkSettings.Networks | keys == [$network]) and
    ((.HostConfig.PortBindings // {}) | length == 0)' >/dev/null
edge=$(docker inspect --format "{{(index .NetworkSettings.Networks \"$ingress\").IPAddress}}" "$(compose ps -q edge)")
export BAPX_SAMPLE_PROBE_ADDRESS="http://$edge:8080"
ready() {
    curl --noproxy '*' --retry 16 --retry-delay 1 --retry-connrefused --max-time 4 \
        --silent --show-error --fail --output /dev/null \
        -H 'Host: dynamic-check.example.test' "$BAPX_SAMPLE_PROBE_ADDRESS/healthz"
}
ready
if node "$here/probe.mjs" seed "$scratch/proof.json" 0000000000000000000000000000000000000000 >/dev/null 2>&1; then
    echo 'The sample accepted a mismatched app revision.' >&2
    exit 1
fi
test ! -e "$scratch/proof.json"
node "$here/probe.mjs" seed "$scratch/proof.json" "$revision"
compose up -d --pull never --no-deps --force-recreate app
ready
node "$here/probe.mjs" reopen "$scratch/proof.json" "$revision"
