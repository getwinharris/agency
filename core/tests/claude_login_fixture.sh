#!/bin/sh
tool=$(CLAUDECODE=1 bash -c '. "${CLAUDE_ENV_FILE:-/dev/null}"; printf %s "$ANTHROPIC_API_KEY"')
key='import os; print(os.environ.get("ANTHROPIC_API_KEY", ""))'
mcp=$(CLAUDECODE=1 python3 -c "$key") own=$(CLAUDECODE=1 ANTHROPIC_API_KEY=mine python3 -c "$key")
case "${CLAUDE_ENV_FILE:+hook}|$ANTHROPIC_AUTH_TOKEN|$ANTHROPIC_API_KEY|$CLAUDE_CODE_OAUTH_TOKEN|$tool|$mcp|$own" in
    "hook|||plan|app|app|mine"|"|app|app|plan|app|app|mine") echo '{"is_error":false}' ;;
    *) echo '{"is_error":true}' ;;
esac
