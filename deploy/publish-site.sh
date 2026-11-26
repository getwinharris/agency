#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
    echo "Usage: sudo bash deploy/publish-site.sh ACCOUNT BUSINESS PROJECT" >&2
    exit 2
fi

umask 077
slug=sandbox-check
users=/root/bapx.in/users
volume=traefik-vmm1_agency-web-sites
image=$(jq -er '.image' /var/lib/bapx-agency-web-deploy/last-good.json)
if [[ ! "$image" =~ ^ghcr\.io/getwinharris/agency-web@sha256:[0-9a-f]{64}$ ]]; then
    echo "Expected the verified Agency web image digest" >&2
    exit 1
fi

# Require the web release to have provisioned this named volume.
docker volume inspect "$volume" >/dev/null
scratch=$(mktemp -d /tmp/bapx-site-publish.XXXXXXXX)
extractor=
cleanup() {
    if [[ -n "$extractor" ]]; then
        docker rm "$extractor" >/dev/null || true
    fi
    rm -rf -- "$scratch"
}
trap cleanup EXIT

extractor=$(docker create --pull never --network none "$image")
docker cp "$extractor:/usr/local/bin/cloudroom" "$scratch/cloudroom"
"$scratch/cloudroom" publish-site stage "$users" "$scratch/dist" "$slug" "$@"

# The protected copy stays alive through Docker's bind-mount resolution.
docker run --rm --pull never --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges \
    --mount "type=bind,source=$scratch/dist,target=/srv/bapx-site-dist,readonly" \
    --mount "type=volume,source=$volume,target=/var/lib/bapx-sites,volume-nocopy" \
    --entrypoint /usr/local/bin/cloudroom "$image" \
    publish-site release /srv/bapx-site-dist /var/lib/bapx-sites "$slug" "$@"
