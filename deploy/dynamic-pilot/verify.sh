#!/usr/bin/env bash
set -euo pipefail
umask 077

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
source_sha=$(git -C "$repo" rev-parse --verify "${1:-HEAD}^{commit}")
baseline_sha=b5b01577d2991698f0ddac5d750ff23698b33a1a
keep=${BAPX_PILOT_KEEP:-0}
[[ "$keep" == 0 || "$keep" == 1 ]]
git -C "$repo" grep -q APP_BIND_ADDRESS "$source_sha" -- starters/app-admin/config.mjs

node_image=node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd
edge_image=nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
host=dynamic-check.example.test
origin="https://$host:8443"
work=$(mktemp -d "${TMPDIR:-/tmp}/bapx-dynamic-hosting.XXXXXXXX")
suffix=${work##*.}
project="bapx-dynamic-${suffix,,}"
network="$project-edge"
ingress="$project-ingress"
data="$project-data"
fixture="$project-fixture"
edge="$project-proxy"
app=
volumes=()

cleanup() {
    local status=$? cleanup_failed=0 volume
    if (( status == 0 && keep == 1 )); then return; fi
    if (( status )); then
        if [[ -n "$app" ]]; then docker logs "$app" >&2 || true; fi
        if docker inspect "$edge" >/dev/null 2>&1; then docker logs "$edge" >&2 || true; fi
    fi
    if [[ -n "$app" ]]; then docker rm -f "$app" >/dev/null 2>&1 || true; fi
    docker rm -f "$edge" >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
    if (( keep == 1 )); then docker network rm "$ingress" >/dev/null 2>&1 || true; fi
    for volume in ${volumes[@]+"${volumes[@]}"}; do
        docker volume rm "$volume" >/dev/null || cleanup_failed=1
    done
    rm -f -- "$work/owner-password" "$work/tls/key.pem" || cleanup_failed=1
    if (( cleanup_failed )); then
        echo 'Could not remove all isolated fixture volumes or credentials.' >&2
        exit 1
    fi
    echo 'Removed isolated fixture volumes and credentials.'
    return "$status"
}
trap cleanup EXIT

build() {
    local sha=$1 tag="$project:$2" context="$work/source-$2"
    mkdir "$context"
    git -C "$repo" archive "$sha" starters/app-admin |
        tar --same-permissions --no-same-owner -xf - -C "$context"
    docker build --file "$here/Dockerfile" --build-arg "SOURCE_SHA=$sha" --tag "$tag" "$context" >&2
    local id
    id=$(docker image inspect --format '{{.Id}}' "$tag")
    test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$id")" = "$sha"
    printf '%s\n' "$id"
}
baseline_image=$(build "$baseline_sha" baseline)
candidate_image=$(build "$source_sha" candidate)
test "$baseline_image" != "$candidate_image"

mkdir "$work/tls"
openssl rand -hex 24 > "$work/owner-password"
chmod 0444 "$work/owner-password"
openssl req -new -newkey rsa:2048 -noenc -x509 -days 1 -subj "/CN=$host" \
    -addext "subjectAltName=DNS:$host" -keyout "$work/tls/key.pem" -out "$work/tls/cert.pem" 2>/dev/null
chmod 0755 "$work/tls"
chmod 0444 "$work/tls/"{cert,key}.pem
docker network create --internal "$network" >/dev/null
docker volume create "$data" >/dev/null
volumes+=("$data")
docker volume create "$fixture" >/dev/null
volumes+=("$fixture")
docker run --rm --network none --mount "type=volume,source=$fixture,target=/fixture-data" \
    "$node_image" sh -ec 'chown 1000:1000 /fixture-data && chmod 0700 /fixture-data'

hardened=(--network "$network" --read-only --cap-drop ALL --security-opt no-new-privileges \
    --memory 256m --cpus .5 --pids-limit 64)
edge_ports=()
if (( keep == 1 )); then edge_ports=(--publish 127.0.0.1:8443:8443); fi
docker run -d --name "$edge" --network-alias edge --user 101:101 "${hardened[@]}" "${edge_ports[@]}" \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m \
    --mount "type=bind,src=$work/tls,dst=/tls,readonly" \
    --mount "type=bind,src=$here/nginx.conf,dst=/nginx.conf,readonly" \
    --entrypoint nginx "$edge_image" -c /nginx.conf -g 'daemon off;' >/dev/null
if (( keep == 1 )); then
    docker network create "$ingress" >/dev/null
    docker network connect "$ingress" "$edge"
fi

start() {
    local image_id=$1
    app="$project-app-$2"
    docker run -d --name "$app" --network-alias app "${hardened[@]}" \
        --mount "type=volume,source=$data,target=/private" \
        --mount "type=volume,source=$fixture,target=/fixture-data" \
        --mount "type=bind,source=$here/fixture.mjs,target=/fixture.mjs,readonly" \
        -e APP_ID=dynamic-pilot -e APP_NAME='Isolated Dynamic Pilot' -e "APP_ORIGIN=$origin" \
        --mount "type=bind,source=$work/owner-password,target=/owner-password,readonly" \
        -e APP_OWNER_PASSWORD_FILE=/owner-password \
        -e APP_DATA_DIR=/private -e APP_OWNER_EMAIL=owner@example.test \
        -e APP_EMAIL_FROM=sender@example.test -e APP_RESEND_API_KEY=fixture-only \
        -e APP_BIND_ADDRESS=0.0.0.0 -e NODE_OPTIONS=--import=/fixture.mjs \
        "$image_id" >/dev/null
    docker inspect "$app" | jq -e --arg net "$network" --arg image "$image_id" '
        .[0] | .Image == $image and ((.HostConfig.PortBindings // {}) | length) == 0
        and (.NetworkSettings.Networks | keys == [$net])' >/dev/null
    docker inspect "$edge" | jq -e --argjson keep "$keep" --arg net "$network" --arg ingress "$ingress" '
        .[0] | (.NetworkSettings.Networks | keys == (if $keep == 1 then [$net, $ingress] | sort else [$net] end)) and
        (.HostConfig.PortBindings // {} | if $keep == 1 then
          . == {"8443/tcp":[{"HostIp":"127.0.0.1","HostPort":"8443"}]}
        else length == 0 end)' >/dev/null
}

probe() {
    docker run --rm "${hardened[@]}" --user 1000:1000 -e "APP_ORIGIN=$origin" -e "EXPECTED_REVISION=$2" \
        --mount "type=volume,source=$fixture,target=/fixture-data" \
        --mount "type=bind,source=$work/tls/cert.pem,target=/tls/cert.pem,readonly" \
        --mount "type=bind,source=$here/probe.mjs,target=/probe.mjs,readonly" \
        --mount "type=bind,source=$work/owner-password,target=/owner-password,readonly" \
        "$node_image" node /probe.mjs "$1"
}

replace() {
    docker stop --time 10 "$app" >/dev/null
    docker rm "$app" >/dev/null
    start "$1" "$2"
}

start "$baseline_image" baseline
probe seed "$baseline_sha"
replace "$candidate_image" candidate
probe upgrade "$source_sha"
replace "$candidate_image" restarted
probe restart "$source_sha"
replace "$baseline_image" rollback
probe rollback "$baseline_sha"

if (( keep == 1 )); then
    replace "$candidate_image" staging
    probe restart "$source_sha"
    curl --noproxy '*' --fail --silent --show-error --max-time 10 \
        --cacert "$work/tls/cert.pem" --resolve "$host:8443:127.0.0.1" \
        --dump-header "$work/health.headers" --output /dev/null "$origin/healthz"
    tr -d '\r' < "$work/health.headers" | grep -Fxqi "X-BapX-App-Revision: $source_sha"
fi
printf 'Build SHA %s\nImage ID %s\nRollback SHA %s\nRollback image %s\nIsolated HTTPS %s/\nApp data volume %s\nFixture volume %s\n' \
    "$source_sha" "$candidate_image" "$baseline_sha" "$baseline_image" "$origin" "$data" "$fixture" |
    tee "$work/verification.txt"
if (( keep == 1 )); then
    printf 'Loopback staging is running. Use CA %s and resolve %s to 127.0.0.1.\n' "$work/tls/cert.pem" "$host"
fi
printf 'Private fixture evidence %s\n' "$work/verification.txt"
