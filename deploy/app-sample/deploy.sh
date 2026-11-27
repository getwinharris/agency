#!/usr/bin/env bash
set -euo pipefail
umask 077

repo=getwinharris/agency
host=dynamic-check.app.bapx.in
state=/var/lib/bapx-agency-app-sample
platform=/var/lib/bapx-agency-web-deploy/last-good.json
image_pattern='^ghcr\.io/getwinharris/agency-app-sample@sha256:[a-f0-9]{64}$'
revision_pattern='^[a-f0-9]{40}$'
key_pattern='^[0-9]+-[0-9]+$'

install -d -m 0700 "$state/releases"
exec 9>"$state/deploy.lock"
flock -n 9 || exit 0

file_hash() {
    local hashed
    hashed=$(sha256sum -- "$1") || return 1
    printf '%s\n' "${hashed%% *}"
}

validate_bundle() {
    local bundle=$1 expected_sha=$2 compose_hash proxy_hash
    local file
    for file in release.json compose.yml nginx.conf; do
        [[ -f $bundle/$file && ! -L $bundle/$file ]] || return 1
    done
    bundled_image=$(jq -er '.image' "$bundle/release.json") || return 1
    bundled_revision=$(jq -er '.sha' "$bundle/release.json") || return 1
    compose_hash=$(jq -er '.composeSha256' "$bundle/release.json") || return 1
    proxy_hash=$(jq -er '.proxySha256' "$bundle/release.json") || return 1
    [[ $bundled_image =~ $image_pattern && $bundled_revision =~ $revision_pattern &&
       ( -z $expected_sha || $bundled_revision == "$expected_sha" ) &&
       $(file_hash "$bundle/compose.yml") == "$compose_hash" &&
       $(file_hash "$bundle/nginx.conf") == "$proxy_hash" ]]
}

compose() {
    local bundle=$1 image=$2
    shift 2
    BAPX_SAMPLE_IMAGE=$image docker compose --project-name bapx-app-sample -f "$bundle/compose.yml" "$@"
}

matches_image() {
    local bundle=$1 image=$2 revision=$3 id container
    container=$(compose "$bundle" "$image" ps -q app) || return 1
    [[ -n $container ]] || return 1
    id=$(docker image inspect --format '{{.Id}}' "$image") || return 1
    [[ $(docker inspect --format '{{.Image}}' "$container") == "$id" &&
       $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$id") == "$revision" ]]
}

public_request() {
    curl --noproxy '*' --resolve "$host:443:127.0.0.1" --silent --show-error --max-time 5 "$@"
}

smoke() {
    local bundle=$1 image=$2 revision=$3 code page
    matches_image "$bundle" "$image" "$revision" || return 1
    code=$(public_request --output /dev/null --dump-header "$stage/health" --write-out '%{http_code}' \
        "https://$host/healthz") || return 1
    [[ $code == 204 ]] && grep -Fxiq "X-BapX-App-Revision: $revision" <(tr -d '\r' < "$stage/health") || return 1
    code=$(public_request --output /dev/null --write-out '%{http_code}' "https://$host/admin") || return 1
    [[ $code == 401 ]] || return 1
    page=$(public_request --fail "https://$host/") || return 1
    [[ $page == *'bapX Node sample'* ]]
}

wait_healthy() {
    local limit=$1 attempt
    shift
    for ((attempt = 1; attempt <= limit; attempt++)); do
        if smoke "$@"; then return 0; fi
        sleep 2
    done
    return 1
}

restore_pending() {
    local candidate prior bundle
    candidate=$(<"$state/pending")
    prior=$(<"$state/current")
    [[ $candidate =~ $key_pattern && ( -z $prior || $prior =~ $key_pattern ) ]] || return 1
    if [[ $candidate == "$prior" ]]; then
        rm -f -- "$state/pending"
        return
    fi
    if [[ -n $prior ]]; then
        bundle="$state/releases/$prior"
        validate_bundle "$bundle" "" || return 1
        compose "$bundle" "$bundled_image" up -d --pull never || return 1
        wait_healthy 20 "$bundle" "$bundled_image" "$bundled_revision" || return 1
    else
        bundle="$state/releases/$candidate"
        validate_bundle "$bundle" "" || return 1
        compose "$bundle" "$bundled_image" down || return 1
        [[ -z $(compose "$bundle" "$bundled_image" ps -q) ]] || return 1
    fi
    printf '%s\n' "$candidate" > "$stage/rejected" &&
        mv -f -- "$stage/rejected" "$state/rejected" &&
        rm -f -- "$state/pending" || return 1
    printf 'Rolled back Node sample attempt %s. The data volume is retained.\n' "$candidate" >&2
}

stage=$(mktemp -d "$state/release.XXXXXX")
active=false
finish() {
    local status=$?
    trap - EXIT
    if $active && ! restore_pending; then
        echo 'Node sample rollback is pending. The next web timer run will retry it.' >&2
        status=1
    fi
    rm -rf -- "$stage"
    exit "$status"
}
trap finish EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
[[ -f $state/current ]] || touch "$state/current"
if [[ -f $state/pending ]]; then restore_pending; fi

[[ -f $platform ]] || exit 0
receipt=$(<"$platform")
revision=$(jq -er '.sha' <<< "$receipt")
run=$(jq -er '.run' <<< "$receipt")
attempt=$(jq -er '.attempt' <<< "$receipt")
[[ $revision =~ $revision_pattern && $run =~ ^[0-9]+$ && $attempt =~ ^[0-9]+$ ]] || exit 1
key="$run-$attempt"
[[ ! -f $state/rejected || $(<"$state/rejected") != "$key" ]] || exit 0

gate_passes() {
    local main platform_revision
    main=$(gh api "repos/$repo/git/ref/heads/main" --jq .object.sha) || return 1
    [[ $main == "$revision" && $(<"$platform") == "$receipt" ]] || return 1
    platform_revision=$(curl --noproxy '*' --resolve 'bapx.in:443:127.0.0.1' --max-time 5 \
        --fail --silent --show-error https://bapx.in/healthz) || return 1
    jq -e --arg sha "$revision" '.ready == true and .service == "bapx-web" and .revision == $sha' \
        <<< "$platform_revision" >/dev/null
}

gate_passes || exit 0
bundle="$state/releases/$key"
if [[ $(<"$state/current") == "$key" ]]; then
    validate_bundle "$bundle" "$revision"
    if ! wait_healthy 3 "$bundle" "$bundled_image" "$revision"; then
        printf 'Node sample %s failed public verification. Inspect before replacing the running release.\n' "$revision" >&2
        exit 1
    fi
    exit 0
fi

run_matches() {
    gh api "repos/$repo/actions/runs/$run" |
        jq -e --arg repo "$repo" --arg sha "$revision" --arg attempt "$attempt" '
            .name == "Public web" and (.event == "push" or .event == "workflow_dispatch") and
            .head_branch == "main" and .head_repository.full_name == $repo and .head_sha == $sha and
            (.run_attempt | tostring) == $attempt and .status == "completed" and .conclusion == "success"' >/dev/null
}
run_matches || exit 0
artifact_count=$(gh api "repos/$repo/actions/runs/$run/artifacts?name=agency-app-sample-release" --jq .total_count)
[[ $artifact_count == 1 ]] || exit 0
if [[ ! -d $bundle ]]; then
    gh run download "$run" --repo "$repo" --name agency-app-sample-release --dir "$stage/download"
    validate_bundle "$stage/download" "$revision"
    mv -T -- "$stage/download" "$bundle"
fi
validate_bundle "$bundle" "$revision"
image=$bundled_image
compose "$bundle" "$image" config --format json | jq -e --arg image "$image" '
    .services.app.image == $image and (.services.app.ports // [] | length == 0) and
    (.services.edge.ports // [] | length == 0) and .networks.private.internal == true' >/dev/null
if ! docker pull "$image"; then
    install -d -m 0700 "$stage/docker"
    login=$(gh api user --jq .login)
    gh auth token | docker --config "$stage/docker" login ghcr.io --username "$login" --password-stdin
    docker --config "$stage/docker" pull "$image"
fi
compose "$bundle" "$image" pull edge
[[ $(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image") == "$revision" ]]
run_matches && gate_passes || exit 0

printf '%s\n' "$key" > "$stage/next"
mv -f -- "$stage/next" "$state/pending"
active=true
compose "$bundle" "$image" up -d --pull never
wait_healthy 35 "$bundle" "$image" "$revision"
gate_passes
printf '%s\n' "$key" > "$stage/current"
mv -f -- "$stage/current" "$state/current"
active=false
rm -f -- "$state/pending"
printf 'Deployed public Node sample %s as %s from run %s/%s.\n' "$revision" "$image" "$run" "$attempt"
