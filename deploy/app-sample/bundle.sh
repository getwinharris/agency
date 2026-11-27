#!/usr/bin/env bash
set -euo pipefail
umask 077

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
image=${1:?Pass the sample image by digest}
revision=${2:?Pass the exact build SHA}
output=${3:?Pass a new release directory}
[[ $image =~ ^ghcr\.io/getwinharris/agency-app-sample@sha256:[a-f0-9]{64}$ ]]
[[ $revision =~ ^[a-f0-9]{40}$ ]]
mkdir -- "$output"
cp -- "$here/compose.yml" "$output/"
install -m 0444 -- "$here/nginx.conf" "$output/nginx.conf"
compose_hash=$(sha256sum "$output/compose.yml" | cut -d' ' -f1)
proxy_hash=$(sha256sum "$output/nginx.conf" | cut -d' ' -f1)
jq -n --arg sha "$revision" --arg image "$image" \
    --arg composeHash "$compose_hash" --arg proxyHash "$proxy_hash" \
    '{sha: $sha, image: $image, composeSha256: $composeHash, proxySha256: $proxyHash}' > "$output/release.json"
