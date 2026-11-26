#!/bin/bash
# One Apple check for a signed, stable macOS installer.
# Apple's ticket for a DMG also covers the app inside it, so only the DMG is uploaded. The app then gets its
# copy of that ticket, and the update ZIP is built from the stapled app.
# Safe to rerun: a DMG that already has its ticket is not sent again.
# Requires APPLE_ID, APPLE_TEAM_ID, and APPLE_APP_SPECIFIC_PASSWORD for the upload.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${BB_DESKTOP_RELEASE_CHANNEL:-latest}" != latest ] || [ "${BAPX_DESKTOP_UPDATES:-0}" = 1 ]; then
  echo "This helper only accepts a stable installer-only build." >&2
  exit 1
fi

version=$(node scripts/desktop-version.mjs)
out=release.noindex
dmg="$out/bapx-agents-v$version-arm64.dmg"
bundle="bapX Agents.app"
app="$out/mac-arm64/$bundle"
# Outside the work folder: a mount left behind there would break the next run's checkout.
work=$(cd "$(mktemp -d)" && pwd -P)
cleanup() {
  node -e 'import("./scripts/macos-bundle.mjs").then((bundle) => bundle.unregisterBundle(process.argv[1]))' "$work" || true
  hdiutil detach "$work/dmg" > /dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

xcrun stapler validate "$dmg" > /dev/null 2>&1 || node scripts/notarize.cjs "$dmg"
# Only the upload needs Apple's login, and the build wrapper below rejects a partial set of signing keys.
unset APPLE_ID APPLE_TEAM_ID APPLE_APP_SPECIFIC_PASSWORD CSC_LINK CSC_KEY_PASSWORD CSC_NAME

mkdir "$work/dmg"
hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$work/dmg" > /dev/null
# A reused build has only its saved DMG, which holds the same signed app.
[ -d "$app" ] || { mkdir -p "$(dirname "$app")" && ditto "$work/dmg/$bundle" "$app"; }
# Apple can take a moment to list the app's ticket after it approves the DMG.
for attempt in 1 2 3 4 5; do
  xcrun stapler staple "$app" && break
  echo "No ticket for the app yet. Retrying in 30 s ($attempt/5)."
  sleep 30
done
xcrun stapler validate "$app"

CSC_IDENTITY_AUTO_DISCOVERY=false node scripts/run-electron-builder.mjs --stamp --mac zip --arm64 --publish never --prepackaged "$app"

# Gatekeeper must accept all three things users get: the DMG, the app they drag out of it, and the app in the update ZIP.
spctl -a -vvv -t open --context context:primary-signature "$dmg"
spctl -a -vvv -t exec "$work/dmg/$bundle"
ditto -x -k "$out/bapx-agents-v$version-arm64.zip" "$work/zip"
xcrun stapler validate "$work/zip/$bundle"
spctl -a -vvv -t exec "$work/zip/$bundle"
