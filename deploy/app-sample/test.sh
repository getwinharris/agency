#!/usr/bin/env bash
set -euo pipefail
umask 077

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export BAPX_SAMPLE_IMAGE=${1:?Pass the sample image}
revision=${2:?Pass the exact build SHA}
scratch=$(mktemp -d)
suffix=${scratch##*.}
project="bapx-sample-test-${suffix,,}"
export BAPX_SAMPLE_INGRESS="$project-ingress"
export BAPX_SAMPLE_ROUTE_ENABLED=false
export BAPX_SAMPLE_OWNER_FILE="$scratch/owner-password"

compose() {
    docker compose --project-name "$project" -f "$scratch/bundle/compose.yml" "$@"
}

cleanup() {
    local result=$?
    if (( result != 0 )); then compose logs --no-color >&2 || true; fi
    compose down --volumes >/dev/null 2>&1 || true
    docker network rm "$BAPX_SAMPLE_INGRESS" >/dev/null 2>&1 || true
    rm -f -- "$scratch/owner-password" "$scratch/proof.json"
    if [[ -d $scratch/bundle ]]; then
        rm -f -- "$scratch/bundle/"{compose.yml,nginx.conf,release.json}
        rmdir "$scratch/bundle"
    fi
    rmdir "$scratch"
}
trap cleanup EXIT

docker network create "$BAPX_SAMPLE_INGRESS" >/dev/null
openssl rand -hex 32 > "$BAPX_SAMPLE_OWNER_FILE"
chmod 0444 "$BAPX_SAMPLE_OWNER_FILE"
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$BAPX_SAMPLE_IMAGE")" = "$revision"

image_id=$(docker image inspect --format '{{.Id}}' "$BAPX_SAMPLE_IMAGE")
bash "$here/bundle.sh" "ghcr.io/getwinharris/agency-app-sample@$image_id" "$revision" "$scratch/bundle"
test "$(stat -c %a "$scratch/bundle/nginx.conf")" = 444

compose pull edge
compose up -d --pull never
docker inspect "$(compose ps -q app)" | jq -e --arg network "${project}_private" '
    .[0] | (.NetworkSettings.Networks | keys == [$network]) and
    ((.HostConfig.PortBindings // {}) | length == 0)' >/dev/null
edge=$(docker inspect --format "{{(index .NetworkSettings.Networks \"$BAPX_SAMPLE_INGRESS\").IPAddress}}" "$(compose ps -q edge)")
export BAPX_SAMPLE_PROBE_ADDRESS="http://$edge:8080"
ready() {
    curl --noproxy '*' --retry 16 --retry-delay 1 --retry-connrefused --max-time 4 \
        --silent --show-error --fail --output /dev/null \
        -H 'Host: dynamic-check.app.bapx.in' "$BAPX_SAMPLE_PROBE_ADDRESS/healthz"
}
ready
node "$here/probe.mjs" seed "$scratch/proof.json" "$revision"
compose up -d --pull never --no-deps --force-recreate app
ready
node "$here/probe.mjs" reopen "$scratch/proof.json" "$revision"
