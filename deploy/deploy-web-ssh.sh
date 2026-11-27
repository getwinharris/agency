#!/usr/bin/env bash
set -euo pipefail

request_pattern='^deploy-web ([a-f0-9]{40}) ([1-9][0-9]*) ([1-9][0-9]*)$'
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ $request_pattern ]]; then
    echo 'Expected a Public web release SHA, run ID, and attempt.' >&2
    exit 2
fi

sha=${BASH_REMATCH[1]}
run=${BASH_REMATCH[2]}
attempt=${BASH_REMATCH[3]}
unit="bapx-agency-web-release-$run-$attempt-$$"
if ! /usr/bin/systemd-run --quiet --unit="$unit" --wait --collect \
    --service-type=oneshot --property=TimeoutStartSec=10min --setenv=HOME=/root \
    /usr/local/libexec/bapx-agency-web-deploy-action "$sha" "$run" "$attempt"; then
    printf 'VPS deployment failed for %s. Operator log: %s.service\n' "$sha" "$unit" >&2
    exit 1
fi

printf 'VPS verified %s from Public web run %s, attempt %s.\n' "$sha" "$run" "$attempt"
