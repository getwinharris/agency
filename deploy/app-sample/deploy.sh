#!/usr/bin/env bash
set -euo pipefail
umask 077

repo=getwinharris/agency
host=dynamic-check.app.bapx.in
state=/var/lib/bapx-agency-app-sample
platform=/var/lib/bapx-agency-web-deploy/last-good.json
image_pattern='^ghcr\.io/getwinharris/agency-app-sample@sha256:[a-f0-9]{64}$'
revision_pattern='^[a-f0-9]{40}$'
number_pattern='^[1-9][0-9]*$'
key_pattern='^[1-9][0-9]*-[1-9][0-9]*$'

if [[ $# -ne 3 || ! $1 =~ $revision_pattern ||
      ! $2 =~ $number_pattern || ! $3 =~ $number_pattern ]]; then
    echo 'Expected the exact Public web SHA, run ID, and attempt.' >&2
    exit 2
fi
revision=$1
run=$2
attempt=$3
key="$run-$attempt"
owner_file=/etc/bapx-agency/sample-owner-password
[[ -f $owner_file && ! -L $owner_file ]] || {
    echo 'The sample owner credential file must be provisioned first.' >&2
    exit 1
}

install -d -m 0700 "$state/releases"
exec 9>"$state/deploy.lock"
flock -n 9 || {
    echo 'Another sample deployment holds the lock.' >&2
    exit 1
}

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
    local candidate prior bundle remaining
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
        remaining=$(compose "$bundle" "$bundled_image" ps --all --quiet) || return 1
        [[ -z $remaining ]] || return 1
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
        echo 'Node sample rollback is pending. The next sample deployment will retry it.' >&2
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

if ! receipt=$(cat -- "$platform") ||
    ! jq -e --arg sha "$revision" --arg run "$run" '
        .sha == $sha and (.run | tostring) == $run
    ' <<< "$receipt" >/dev/null; then
    echo 'The requested Public web release does not match the verified Hostinger receipt.' >&2
    exit 1
fi
if [[ -f $state/rejected && $(<"$state/rejected") == "$key" ]]; then
    echo 'This sample release attempt was rejected. Verify a new Public web attempt before retrying.' >&2
    exit 1
fi

gate_passes() {
    local main platform_revision
    main=$(gh api "repos/$repo/git/ref/heads/main" --jq .object.sha) || return 1
    [[ $main == "$revision" && $(<"$platform") == "$receipt" ]] || return 1
    platform_revision=$(curl --noproxy '*' --resolve 'bapx.in:443:127.0.0.1' --max-time 5 \
        --fail --silent --show-error https://bapx.in/healthz) || return 1
    jq -e --arg sha "$revision" '.ready == true and .service == "bapx-web" and .revision == $sha' \
        <<< "$platform_revision" >/dev/null
}

gate_passes || {
    echo 'The requested web SHA must be current main and serving before sample rollout.' >&2
    exit 1
}
run_matches() {
    gh api "repos/$repo/actions/runs/$run" |
        jq -e --arg repo "$repo" --arg sha "$revision" --arg attempt "$attempt" '
            .path == ".github/workflows/web.yml" and .name == "Public web" and .event == "push" and
            .head_branch == "main" and .head_repository.full_name == $repo and .head_sha == $sha and
            (.run_attempt | tostring) == $attempt and .status == "completed" and .conclusion == "success"' >/dev/null
}
run_matches || {
    echo 'The exact Public web run attempt must have completed successfully.' >&2
    exit 1
}
# A jobs-only rerun can leave a successful sibling on an earlier attempt.
jobs=$(gh api --paginate "repos/$repo/actions/runs/$run/jobs?filter=all&per_page=100")
if ! required=$(jq -es --arg sha "$revision" --arg attempt "$attempt" '
    [.[].jobs[] | select(.head_sha == $sha and .run_attempt <= ($attempt | tonumber))] |
    group_by(.name) | map(max_by([.run_attempt, .id])) |
    map(select(.status == "completed" and .conclusion == "success")) |
    map({key: .name, value: .run_attempt}) | from_entries |
    select(.deploy and .sample)
' <<< "$jobs"); then
    echo 'The exact release requires successful first-party deploy and sample jobs.' >&2
    exit 1
fi
platform_attempt=$(jq -er '.deploy | tostring' <<< "$required")
sample_attempt=$(jq -er '.sample | tostring' <<< "$required")
if [[ ! $platform_attempt =~ $number_pattern || ! $sample_attempt =~ $number_pattern ||
      $(jq -er '.attempt | tostring' <<< "$receipt") != "$platform_attempt" ]]; then
    echo 'The verified Hostinger receipt does not match the successful deploy attempt.' >&2
    exit 1
fi

bundle="$state/releases/$key"
if [[ $(<"$state/current") == "$key" ]]; then
    validate_bundle "$bundle" "$revision"
    if ! wait_healthy 3 "$bundle" "$bundled_image" "$revision"; then
        printf 'Node sample %s failed public verification. Inspect before replacing the running release.\n' "$revision" >&2
        exit 1
    fi
    exit 0
fi

artifact="agency-app-sample-release-$sample_attempt"
artifact_count=$(gh api "repos/$repo/actions/runs/$run/artifacts?name=$artifact" --jq .total_count)
[[ $artifact_count == 1 ]] || {
    echo 'Expected one app sample artifact from the exact Public web run.' >&2
    exit 1
}
if [[ ! -d $bundle ]]; then
    gh run download "$run" --repo "$repo" --name "$artifact" --dir "$stage/download"
    validate_bundle "$stage/download" "$revision"
    chmod 0444 -- "$stage/download/nginx.conf"
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
if ! run_matches || ! gate_passes; then
    echo 'The verified Public web release changed while preparing the sample.' >&2
    exit 1
fi

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
