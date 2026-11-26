#!/usr/bin/env bash
set -euo pipefail
umask 077

repo=getwinharris/agency
project_dir=/docker/traefik-vmm1
compose_file="$project_dir/docker-compose.yml"
override_file="$project_dir/agency-web.compose.yml"
state_dir=/var/lib/bapx-agency-web-deploy
state_file="$state_dir/last-good.json"
failed_file="$state_dir/failed-run"
pending_file="$state_dir/pending.json"
service=agency-web
image_pattern='^ghcr\.io/getwinharris/agency-web@sha256:[a-f0-9]{64}$'
image_id_pattern='^sha256:[a-f0-9]{64}$'
sha_pattern='^[a-f0-9]{40}$'
hash_pattern='^[a-f0-9]{64}$'

exec 9>/run/lock/bapx-www-deploy.lock
flock -n 9 || exit 0

compose_with() {
    local image=$1 config=$2
    shift 2
    BAPX_WEB_IMAGE=$image docker compose --project-name traefik-vmm1 \
        --project-directory "$project_dir" -f "$compose_file" -f "$config" "$@"
}

compose() {
    local image=$1
    shift
    compose_with "$image" "$override_file" "$@"
}

main_sha() {
    local head
    head=$(gh api "repos/$repo/git/ref/heads/main" --jq .object.sha) || return 1
    [[ $head =~ $sha_pattern ]] || return 1
    printf '%s\n' "$head"
}

file_hash() {
    local hash
    hash=$(sha256sum -- "$1") || return 1
    printf '%s\n' "${hash%% *}"
}

snapshot_path() {
    printf '%s/compose-%s.yml\n' "$state_dir" "$1"
}

save_snapshot() {
    local source=$1 hash=$2 snapshot
    snapshot=$(snapshot_path "$hash")
    if [[ -e $snapshot ]]; then
        [[ $(file_hash "$snapshot") == "$hash" ]]
        return
    fi
    install -m 0600 -- "$source" "$stage/snapshot.yml" || return 1
    mv -f -- "$stage/snapshot.yml" "$snapshot"
}

install_override() {
    local source=$1 temporary
    if [[ -z $source ]]; then
        rm -f -- "$override_file"
        return
    fi
    temporary=$(mktemp "$project_dir/.agency-web.compose.XXXXXX") || return 1
    if install -m 0644 -- "$source" "$temporary" && mv -f -- "$temporary" "$override_file"; then
        return 0
    fi
    rm -f -- "$temporary"
    return 1
}

health_matches() {
    jq -e --arg revision "$1" \
        '.ready == true and .service == "bapx-web" and (if $revision == "" then .revision == null else .revision == $revision end)' >/dev/null
}

image_health_revision() {
    local config revision
    config=$(docker image inspect --format '{{json .Config.Env}}' "$1") || return 1
    revision=$(jq -er '[.[]? | select(startswith("BAPX_WEB_REVISION=")) |
        ltrimstr("BAPX_WEB_REVISION=")][0] // ""' <<< "$config") || return 1
    [[ -z $revision || $revision =~ $sha_pattern ]] || return 1
    printf '%s\n' "$revision"
}

check_container() {
    local image=$1 revision=$2 container image_id ip
    container=$(compose "$image" ps -q "$service") || return 1
    [[ -n $container ]] || return 1
    image_id=$(docker image inspect --format '{{.Id}}' "$image") || return 1
    [[ $(docker inspect --format '{{.Image}}' "$container") == "$image_id" ]] || return 1
    ip=$(docker inspect --format '{{(index .NetworkSettings.Networks "traefik-vmm1_default").IPAddress}}' "$container") || return 1
    [[ -n $ip ]] || return 1
    curl --noproxy '*' --fail --silent --show-error --max-time 4 -H 'Host: localhost' "http://$ip:8080/healthz" |
        health_matches "$revision"
}

wait_for() {
    local limit=$1 attempt
    shift
    for ((attempt = 1; attempt <= limit; attempt++)); do
        if "$@"; then
            return 0
        fi
        sleep 2
    done
    return 1
}

check_public() {
    local revision=$1 host path marker page status
    while read -r host path marker; do
        page=$(curl --noproxy '*' --resolve "$host:443:127.0.0.1" \
            --fail --silent --show-error --max-time 8 "https://$host$path") || return 1
        if [[ ${page,,} != *"${marker,,}"* ]]; then
            printf 'Expected page marker is missing at https://%s%s.\n' "$host" "$path" >&2
            return 1
        fi
        if ! curl --noproxy '*' --resolve "$host:443:127.0.0.1" \
            --fail --silent --show-error --max-time 8 "https://$host/healthz" | health_matches "$revision"; then
            printf 'Unexpected web health or revision at https://%s/healthz.\n' "$host" >&2
            return 1
        fi
    done <<'ROUTES'
bapx.in / Start on your Mac.
docs.bapx.in / bapX Agents documentation
mediahub.bapx.in /clients/nebo-lifestyle-clinic/ Nebo Lifestyle Clinic
admin.bapx.in / <h1 id="login-title">Sign in</h1>
ROUTES
    status=$(curl --noproxy '*' --resolve 'admin.bapx.in:443:127.0.0.1' \
        --silent --show-error --max-time 8 --output /dev/null --write-out '%{http_code}' \
        https://admin.bapx.in/api/admin/session) || return 1
    if [[ $status != 401 ]]; then
        printf 'Admin session check returned HTTP %s instead of 401.\n' "$status" >&2
        return 1
    fi
}

check_current_release() {
    local image=$1 revision=$2 hash=$3
    [[ $(file_hash "$override_file") == "$hash" ]] &&
        check_container "$image" "$revision" && check_public "$revision"
}

abandon_pending() {
    rm -f -- "$pending_file"
}

restore_pending() {
    local prior config_hash revision candidate candidate_hash run attempt recorded restored_sha snapshot= remaining
    if [[ -f $state_file ]] && jq -e --slurpfile pending "$pending_file" '
        . as $state | $pending[0] | .rollbackRecorded != true and
            .sha == $state.sha and .image == $state.image and
            .composeSha256 == $state.composeSha256 and .run == $state.run and .attempt == $state.attempt
        ' "$state_file" >/dev/null; then
        abandon_pending
        return
    fi

    prior=$(jq -er '.prior.image' "$pending_file") || return 1
    config_hash=$(jq -er '.prior.composeSha256' "$pending_file") || return 1
    revision=$(jq -er '.prior.revision' "$pending_file") || return 1
    candidate=$(jq -er '.image' "$pending_file") || return 1
    candidate_hash=$(jq -er '.composeSha256' "$pending_file") || return 1
    run=$(jq -er '.run' "$pending_file") || return 1
    attempt=$(jq -er '.attempt' "$pending_file") || return 1
    recorded=$(jq -r '.rollbackRecorded // false' "$pending_file") || return 1
    [[ $candidate =~ $image_pattern && $candidate_hash =~ $hash_pattern &&
        $run =~ ^[0-9]+$ && $attempt =~ ^[0-9]+$ ]] || return 1
    [[ -z $revision || $revision =~ $sha_pattern ]] || return 1
    if [[ -n $config_hash ]]; then
        [[ $config_hash =~ $hash_pattern ]] || return 1
        snapshot=$(snapshot_path "$config_hash")
        [[ $(file_hash "$snapshot") == "$config_hash" ]] || return 1
    fi
    if [[ $recorded == true ]]; then
        restored_sha=$(jq -er '.prior.sha' "$pending_file") || return 1
        [[ -n $prior && $restored_sha =~ $sha_pattern &&
            ( -z $revision || $revision == "$restored_sha" ) ]] || return 1
    fi
    if [[ -n $prior ]]; then
        [[ -n $snapshot && ( $prior =~ $image_pattern || $prior =~ $image_id_pattern ) ]] || return 1
        install_override "$snapshot" &&
            compose "$prior" up -d --no-deps --pull never "$service" &&
            wait_for 20 check_container "$prior" "$revision" &&
            wait_for 8 check_public "$revision" || return 1
    else
        local candidate_config
        candidate_config=$(snapshot_path "$candidate_hash")
        [[ $(file_hash "$candidate_config") == "$candidate_hash" ]] || return 1
        compose_with "$candidate" "$candidate_config" rm --stop --force "$service" || return 1
        remaining=$(compose_with "$candidate" "$candidate_config" ps -q "$service") || return 1
        [[ -z $remaining ]] || return 1
        install_override "$snapshot" || return 1
    fi
    if [[ $recorded == true ]]; then
        jq '.prior | {sha, image, composeSha256, revision, run, attempt}' \
            "$pending_file" > "$stage/last-good.json" &&
            mv -f -- "$stage/last-good.json" "$state_file" || return 1
    fi
    printf '%s/%s\n' "$run" "$attempt" > "$stage/failed-run" &&
        mv -f -- "$stage/failed-run" "$failed_file" &&
        abandon_pending || return 1
    if [[ $recorded == true ]]; then
        printf 'Restored Agency web %s as %s.\n' "$restored_sha" "$prior"
    fi
    printf 'Restored and verified the state before Public web run %s/%s.\n' "$run" "$attempt"
}

prepare_recorded_rollback() {
    local fallback hash fallback_sha fallback_revision
    fallback=$(jq -er '.previousImage // ""' "$state_file") || return 1
    hash=$(jq -er '.previousComposeSha256 // ""' "$state_file") || return 1
    [[ ( $fallback =~ $image_pattern || $fallback =~ $image_id_pattern ) && $hash =~ $hash_pattern ]] || return 1
    [[ $(file_hash "$(snapshot_path "$hash")") == "$hash" ]] || return 1
    fallback_sha=$(jq -er '.previousRelease.sha // ""' "$state_file") || return 1
    if [[ -z $fallback_sha ]]; then
        fallback_sha=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$fallback") || return 1
    fi
    if ! fallback_revision=$(jq -er '.previousRelease.revision | strings' "$state_file"); then
        fallback_revision=$(image_health_revision "$fallback") || return 1
    fi
    [[ $fallback_sha =~ $sha_pattern && ( -z $fallback_revision || $fallback_revision == "$fallback_sha" ) ]] || return 1
    jq --arg fallback "$fallback" --arg hash "$hash" --arg sha "$fallback_sha" --arg revision "$fallback_revision" '
        {sha, image, composeSha256, run, attempt, rollbackRecorded: true,
         prior: {sha: $sha, image: $fallback, composeSha256: $hash, revision: $revision,
                 run: .previousRelease.run, attempt: .previousRelease.attempt}}
        ' "$state_file" > "$stage/pending.json" &&
        mv -f -- "$stage/pending.json" "$pending_file"
}

install -d -m 0700 "$state_dir"
stage=$(mktemp -d "$state_dir/deploy.XXXXXX")
changed=false
finish() {
    local code=$?
    trap - EXIT
    if $changed; then
        printf 'Web deployment %s failed. Restoring the previous release.\n' "$sha" >&2
        if ! restore_pending; then
            echo 'Agency web rollback is pending. The next scheduled run will retry it.' >&2
            code=1
        fi
    fi
    rm -rf -- "$stage"
    exit "$code"
}
trap finish EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

if [[ -f $pending_file ]] && ! restore_pending; then
    echo 'Agency web rollback is pending. The next scheduled run will retry it.' >&2
    exit 1
fi

sha=$(main_sha)
runs=$(gh api "repos/$repo/actions/workflows/web.yml/runs?branch=main&event=push&head_sha=$sha&per_page=1")
run=$(jq -c --arg repo "$repo" --arg sha "$sha" '.workflow_runs[0] | select(.name == "Public web"
    and .event == "push" and .head_branch == "main" and .head_repository.full_name == $repo
    and .head_sha == $sha and .status == "completed" and .conclusion == "success")' <<< "$runs")
if [[ -z $run ]]; then
    printf 'Waiting for a successful Public web push at current main %s.\n' "$sha"
    exit 0
fi
run_id=$(jq -er '.id' <<< "$run")
attempt=$(jq -er '.run_attempt' <<< "$run")
[[ $run_id =~ ^[0-9]+$ && $attempt =~ ^[0-9]+$ ]] || exit 1
if [[ -f $failed_file && $(<"$failed_file") == "$run_id/$attempt" ]]; then
    echo 'The latest Public web run was rolled back and verified. Waiting for a new run attempt.'
    exit 0
fi

prior_image=
prior_sha=
prior_hash=
prior_revision=
prior_run=
prior_attempt=
if [[ -f $state_file ]]; then
    prior_image=$(jq -er '.image' "$state_file")
    prior_sha=$(jq -er '.sha' "$state_file")
    prior_hash=$(jq -er '.composeSha256 // ""' "$state_file")
    prior_run=$(jq -er '.run // ""' "$state_file")
    prior_attempt=$(jq -er '.attempt // ""' "$state_file")
    [[ ( $prior_image =~ $image_pattern || $prior_image =~ $image_id_pattern ) && $prior_sha =~ $sha_pattern ]] || exit 1
    if [[ -n $prior_hash ]]; then
        [[ $prior_hash =~ $hash_pattern ]] || exit 1
        prior_revision=$(jq -er '.revision // .sha' "$state_file")
        [[ -z $prior_revision || $prior_revision == "$prior_sha" ]] || exit 1
        if jq -e --arg sha "$sha" --arg run "$run_id" --arg attempt "$attempt" \
            '.sha == $sha and .run == $run and .attempt == $attempt' "$state_file" >/dev/null; then
            healthy=false
            if wait_for 3 check_current_release "$prior_image" "$prior_revision" "$prior_hash"; then
                healthy=true
            fi
            verified_sha=$(main_sha)
            if [[ $verified_sha != "$sha" ]]; then
                printf 'Main advanced while verifying Agency web %s.\n' "$sha"
                exit 0
            fi
            if $healthy; then
                printf 'Agency web %s is current and verified.\n' "$sha"
                exit 0
            fi
            printf 'Current Agency web release %s failed verification.\n' "$sha" >&2
            if prepare_recorded_rollback; then
                changed=true
            else
                echo 'No previously verified Agency web release is available for rollback.' >&2
            fi
            exit 1
        fi
        [[ $(file_hash "$(snapshot_path "$prior_hash")") == "$prior_hash" ]] || exit 1
    else
        prior_revision=$(image_health_revision "$prior_image")
        [[ -z $prior_revision || $prior_revision == "$prior_sha" ]] || exit 1
        if [[ -z $prior_revision && $prior_sha == "$sha" ]] &&
            check_container "$prior_image" "" && check_public "" && [[ $(main_sha) == "$sha" ]]; then
            printf 'Agency web %s is verified. Waiting for the first release manifest.\n' "$sha"
            exit 0
        fi
    fi
fi

release="$stage/release"
gh run download "$run_id" --repo "$repo" --name agency-web-release --dir "$release"
manifest="$release/release.json"
new_config="$release/compose.web.yml"
[[ -f $manifest && ! -L $manifest && -f $new_config && ! -L $new_config ]] || exit 1
image=$(jq -er '.image' "$manifest")
compose_hash=$(jq -er '.composeSha256' "$manifest")
[[ $(jq -er '.sha' "$manifest") == "$sha" && $image =~ $image_pattern &&
    $compose_hash =~ $hash_pattern && $(file_hash "$new_config") == "$compose_hash" ]] || exit 1
compose_with "$image" "$new_config" config --format json |
    jq -e --arg service "$service" --arg image "$image" '.services[$service].image == $image' >/dev/null
save_snapshot "$new_config" "$compose_hash"
new_config=$(snapshot_path "$compose_hash")

if [[ -z $prior_image && -e $override_file ]]; then
    running=$(compose "$image" ps -q "$service")
    if [[ -n $running ]]; then
        prior_image=$(docker inspect --format '{{.Image}}' "$running")
        [[ $prior_image =~ $image_id_pattern ]] || exit 1
        prior_revision=$(image_health_revision "$prior_image")
    fi
fi
if [[ -z $prior_hash && -e $override_file ]]; then
    prior_hash=$(file_hash "$override_file")
    [[ $prior_hash =~ $hash_pattern ]] || exit 1
    save_snapshot "$override_file" "$prior_hash"
fi
if [[ -n $prior_image ]]; then
    [[ -n $prior_hash ]] || exit 1
    docker image inspect "$prior_image" >/dev/null
fi

if ! docker pull "$image"; then
    registry_config="$stage/docker"
    install -d -m 0700 "$registry_config"
    login=$(gh api user --jq .login)
    gh auth token | docker --config "$registry_config" login ghcr.io --username "$login" --password-stdin
    docker --config "$registry_config" pull "$image"
fi
revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
if [[ $revision != "$sha" ]]; then
    printf 'Image revision does not match successful Public web SHA %s.\n' "$sha" >&2
    exit 1
fi
confirmed_run=$(gh api "repos/$repo/actions/runs/$run_id")
jq -e --arg sha "$sha" --arg attempt "$attempt" \
    '.head_sha == $sha and (.run_attempt | tostring) == $attempt and .status == "completed" and .conclusion == "success"' \
    <<< "$confirmed_run" >/dev/null

jq -n --arg sha "$sha" --arg image "$image" --arg composeHash "$compose_hash" \
    --arg run "$run_id" --arg attempt "$attempt" --arg priorImage "$prior_image" \
    --arg priorSha "$prior_sha" --arg priorHash "$prior_hash" --arg priorRevision "$prior_revision" \
    --arg priorRun "$prior_run" --arg priorAttempt "$prior_attempt" \
    '{sha: $sha, image: $image, composeSha256: $composeHash, run: $run, attempt: $attempt,
      prior: {sha: $priorSha, image: $priorImage, composeSha256: $priorHash, revision: $priorRevision,
              run: $priorRun, attempt: $priorAttempt}}' > "$stage/pending.json"
prepared_sha=$(main_sha)
if [[ $prepared_sha != "$sha" ]]; then
    printf 'Main advanced while preparing Agency web %s. Waiting for the next verified image.\n' "$sha"
    exit 0
fi

mv -f -- "$stage/pending.json" "$pending_file"
changed=true
install_override "$new_config"
compose "$image" up -d --no-deps --pull never "$service"
wait_for 20 check_container "$image" "$sha"
wait_for 8 check_public "$sha"
verified_sha=$(main_sha)
if [[ $verified_sha != "$sha" ]]; then
    printf 'Main advanced while verifying Agency web %s.\n' "$sha" >&2
    exit 1
fi
jq '{sha, image, composeSha256, run, attempt,
     previousImage: .prior.image, previousComposeSha256: .prior.composeSha256,
     previousRelease: (.prior | {sha, revision, run, attempt})}' \
    "$pending_file" > "$stage/last-good.json"
mv -f -- "$stage/last-good.json" "$state_file"
changed=false
abandon_pending
printf 'Deployed Agency web %s as %s.\n' "$sha" "$image"
