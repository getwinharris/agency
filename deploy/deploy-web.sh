#!/usr/bin/env bash
set -euo pipefail
umask 077

repo=getwinharris/agency
registry=ghcr.io/getwinharris/agency-web
project_dir=/docker/traefik-vmm1
compose_file="$project_dir/docker-compose.yml"
override_file="$project_dir/agency-web.compose.yml"
state_dir=/var/lib/bapx-agency-web-deploy
state_file="$state_dir/last-good.json"
failed_file="$state_dir/failed-run"
service=agency-web

exec 9>/run/lock/bapx-www-deploy.lock
flock -n 9 || exit 0

compose() {
    local image=$1
    shift
    BAPX_WEB_IMAGE=$image docker compose --project-name traefik-vmm1 \
        --project-directory "$project_dir" -f "$compose_file" -f "$override_file" "$@"
}

on_main() {
    local status
    status=$(gh api "repos/$repo/compare/$1...main" --jq .status) || return 1
    [[ $status == ahead || $status == identical ]]
}

check_container() {
    local image=$1 container image_id ip
    container=$(compose "$image" ps -q "$service") || return 1
    [[ -n $container ]] || return 1
    image_id=$(docker image inspect --format '{{.Id}}' "$image") || return 1
    [[ $(docker inspect --format '{{.Image}}' "$container") == "$image_id" ]] || return 1
    ip=$(docker inspect --format '{{(index .NetworkSettings.Networks "traefik-vmm1_default").IPAddress}}' "$container") || return 1
    [[ -n $ip ]] || return 1
    curl --noproxy '*' --fail --silent --max-time 4 -H 'Host: localhost' "http://$ip:8080/healthz" |
        jq -e '.ready == true and .service == "bapx-web"' >/dev/null
}

wait_for_container() {
    local attempt
    for attempt in {1..20}; do
        if check_container "$1"; then
            return 0
        fi
        sleep 2
    done
    return 1
}

check_public() {
    local url marker page host
    while read -r url marker; do
        host=${url#https://}
        host=${host%%/*}
        page=$(curl --noproxy '*' --resolve "$host:443:127.0.0.1" --fail --silent --max-time 10 "$url") || return 1
        [[ ${page,,} == *"${marker,,}"* ]] || return 1
    done <<'ROUTES'
https://bapx.in/ Coding agents,
https://docs.bapx.in/ bapX Agents documentation
https://mediahub.bapx.in/clients/nebo-lifestyle-clinic/ Nebo Lifestyle Clinic
ROUTES
}

runs=$(gh api "repos/$repo/actions/workflows/web.yml/runs?branch=main&event=push&per_page=1")
run=$(jq -c --arg repo "$repo" '.workflow_runs[0] | select(.name == "Public web"
    and .event == "push" and .head_branch == "main" and .head_repository.full_name == $repo
    and .status == "completed" and .conclusion == "success")' <<< "$runs")
if [[ -z $run ]]; then
    echo 'No successful latest Public web push on main.'
    exit 0
fi
sha=$(jq -er '.head_sha' <<< "$run")
run_id=$(jq -er '.id' <<< "$run")
attempt=$(jq -er '.run_attempt' <<< "$run")
[[ $sha =~ ^[a-f0-9]{40}$ && $run_id =~ ^[0-9]+$ && $attempt =~ ^[0-9]+$ ]] || exit 1
if [[ -f $failed_file && $(<"$failed_file") == "$run_id/$attempt" ]]; then
    echo 'The latest Public web run was rolled back. Waiting for a new run.'
    exit 0
fi
if ! on_main "$sha"; then
    printf 'Public web commit %s is unavailable on main.\n' "$sha" >&2
    exit 1
fi

previous=
if [[ -f $state_file ]]; then
    previous=$(jq -er '.image' "$state_file")
    [[ $previous =~ ^ghcr\.io/getwinharris/agency-web@sha256:[a-f0-9]{64}$ ]] || exit 1
    if [[ $(jq -er '.sha' "$state_file") == "$sha" ]] && check_container "$previous"; then
        exit 0
    fi
    # Keep the immutable rollback image available before changing the running service.
    docker image inspect "$previous" >/dev/null
else
    running=$(compose "${registry}:$sha" ps -q "$service")
    if [[ -n $running ]]; then
        previous=$(docker inspect --format '{{.Image}}' "$running")
        [[ $previous =~ ^sha256:[a-f0-9]{64}$ ]] || exit 1
    fi
fi

install -d -m 0700 "$state_dir"
stage=$(mktemp -d "$state_dir/deploy.XXXXXX")
registry_config=
changed=false
finish() {
    local code=$?
    trap - EXIT
    if $changed; then
        printf 'Web deployment %s failed. Restoring the previous route.\n' "$sha" >&2
        if [[ -n $previous ]]; then
            if ! compose "$previous" up -d --no-deps --pull never "$service" || ! wait_for_container "$previous"; then
                echo 'Agency web rollback requires operator attention.' >&2
                code=1
            fi
        elif ! compose "$image" rm --stop --force "$service"; then
            echo 'Agency web rollback requires operator attention.' >&2
            code=1
        fi
        if ! printf '%s/%s\n' "$run_id" "$attempt" > "$stage/failed-run" ||
            ! mv -f -- "$stage/failed-run" "$failed_file"; then
            echo 'Could not record the failed web deployment attempt.' >&2
            code=1
        fi
    fi
    rm -rf -- "$stage"
    if [[ -n $registry_config ]]; then
        rm -rf -- "$registry_config"
    fi
    exit "$code"
}
trap finish EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

tag="$registry:$sha"
if ! docker pull "$tag"; then
    registry_config=$(mktemp -d /run/bapx-agency-web-registry.XXXXXX)
    login=$(gh api user --jq .login)
    gh auth token | docker --config "$registry_config" login ghcr.io --username "$login" --password-stdin
    docker --config "$registry_config" pull "$tag"
fi
image=$(docker image inspect --format '{{json .RepoDigests}}' "$tag" |
    jq -er --arg prefix "$registry@sha256:" 'first(.[] | select(startswith($prefix)))')
[[ $image =~ ^ghcr\.io/getwinharris/agency-web@sha256:[a-f0-9]{64}$ ]] || exit 1
revision=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")
if [[ $revision != "$sha" ]]; then
    printf 'Image revision does not match successful Public web SHA %s.\n' "$sha" >&2
    exit 1
fi
on_main "$sha"

changed=true
compose "$image" up -d --no-deps --pull never "$service"
wait_for_container "$image"
check_public
jq -n --arg sha "$sha" --arg image "$image" --arg run "$run_id" --arg previous "$previous" \
    '{sha: $sha, image: $image, run: $run, previousImage: $previous}' > "$stage/last-good.json"
mv -f -- "$stage/last-good.json" "$state_file"
changed=false
printf 'Deployed Agency web %s as %s.\n' "$sha" "$image"
