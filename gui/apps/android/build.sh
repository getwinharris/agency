#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd "$(dirname "$0")" && pwd)
sdk_dir=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
: "${sdk_dir:?Set ANDROID_HOME to the Android SDK directory.}"
: "${BAPX_ANDROID_WORKSPACE_URL:?Set the hosted bapX Agents HTTPS workspace URL.}"
: "${BAPX_ANDROID_KEYSTORE:?Set the release keystore path.}"
: "${BAPX_ANDROID_KEY_ALIAS:?Set the release key alias.}"
: "${BAPX_ANDROID_KEYSTORE_PASSWORD:?Provide the release keystore password.}"
export BAPX_ANDROID_KEY_PASSWORD=${BAPX_ANDROID_KEY_PASSWORD:-$BAPX_ANDROID_KEYSTORE_PASSWORD}

tools="$sdk_dir/build-tools/36.0.0"
platform="$sdk_dir/platforms/android-36/android.jar"
test -f "$platform" && test -x "$tools/apksigner" || {
  printf '%s\n' 'Install Android API 36 and build-tools 36.0.0.' >&2
  exit 1
}
build=$(mktemp -d)
trap 'rm -rf -- "$build"' EXIT
mkdir -p "$build/res/drawable-nodpi" "$build/res/values" "$build/classes" "$build/dex"
cp "$project_dir/../desktop/assets/icon.png" "$build/res/drawable-nodpi/bapx_agents_icon.png"

version=$(python3 - "$build/res/values/workspace.xml" "$project_dir/AndroidManifest.xml" <<'PY'
from os import environ
from sys import argv
from urllib.parse import urlsplit
from xml.etree import ElementTree as xml

address = environ['BAPX_ANDROID_WORKSPACE_URL']
url = urlsplit(address)
separate_sites = {'bapx.in', 'www.bapx.in', 'docs.bapx.in', 'mediahub.bapx.in', 'admin.bapx.in',
                  'platform.bapx.in', 'blogs.bapx.in', 'api.bapx.in'}
if (any(character.isspace() for character in address) or '\\' in address or
    url.scheme != 'https' or not url.hostname or url.username is not None or
    url.password is not None or url.query or url.fragment or url.hostname.rstrip('.') in separate_sites):
    raise SystemExit('Set an HTTPS agent workspace URL without credentials, a query or a fragment.')
resources = xml.Element('resources')
xml.SubElement(resources, 'string', name='workspace_url', translatable='false', formatted='false').text = '\"' + address.replace('\"', '\\\"') + '\"'
xml.ElementTree(resources).write(argv[1], encoding='utf-8', xml_declaration=True)
manifest = xml.parse(argv[2]).getroot()
print(manifest.get('{http://schemas.android.com/apk/res/android}versionName'))
PY
)

"$tools/aapt2" compile --dir "$build/res" -o "$build/resources.zip"
"$tools/aapt2" link -I "$platform" --manifest "$project_dir/AndroidManifest.xml" \
  --java "$build" -o "$build/app.apk" "$build/resources.zip"
javac --release 8 -classpath "$platform" -d "$build/classes" \
  "$build/in/bapx/agents/R.java" "$project_dir/src/in/bapx/agents/WorkspaceActivity.java"
jar cf "$build/classes.jar" -C "$build/classes" .
"$tools/d8" --release --min-api 23 --lib "$platform" --output "$build/dex" "$build/classes.jar"
jar uf "$build/app.apk" -C "$build/dex" classes.dex
"$tools/zipalign" -f 4 "$build/app.apk" "$build/aligned.apk"
"$tools/apksigner" sign --ks "$BAPX_ANDROID_KEYSTORE" --ks-key-alias "$BAPX_ANDROID_KEY_ALIAS" \
  --ks-pass env:BAPX_ANDROID_KEYSTORE_PASSWORD --key-pass env:BAPX_ANDROID_KEY_PASSWORD \
  --out "$build/signed.apk" "$build/aligned.apk"
"$tools/apksigner" verify --print-certs "$build/signed.apk"
output_dir=${BAPX_ANDROID_OUTPUT_DIR:-$project_dir/dist}
mkdir -p "$output_dir"
output="$output_dir/bapx-agents-v$version-android.apk"
cp "$build/signed.apk" "$output"
printf '%s\n' "$output"
