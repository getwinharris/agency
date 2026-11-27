#!/bin/bash
set -euo pipefail

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ $# == 3 ]] || die "Usage: $0 <release directory> <MAJOR.MINOR.PATCH> <full source SHA>"
version=$2
source_sha=$3
[[ $version =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || die "Expected a version without the v prefix."
[[ $source_sha =~ ^[0-9a-f]{40}$ ]] || die "Expected a full lowercase Git SHA."
[[ $(uname -s) == Darwin ]] || die "macOS is required to verify a release candidate."
release_dir=$(CDPATH= cd -- "$1" && pwd -P) || die "Cannot open the release directory: $1"
dmg="$release_dir/bapx-agents-v$version-arm64.dmg"
zip="$release_dir/bapx-agents-v$version-arm64.zip"
for artifact in "$dmg" "$zip"; do
  [[ -f $artifact && ! -L $artifact ]] || die "Expected a regular artifact file: $artifact"
done
[[ $(spctl --status) == 'assessments enabled' ]] || die "Gatekeeper assessments must be enabled."

work=$(mktemp -d "${TMPDIR:-/tmp}/bapx-verify-macos-release.XXXXXX")
mount="$work/dmg"
cleanup() {
  local status=$?
  # Remove the empty mountpoint if attach failed. Otherwise, detach before removing scratch files.
  if [[ -d $mount ]] && ! rmdir "$mount" 2>/dev/null && ! hdiutil detach "$mount"; then
    printf 'Could not detach %s. Temporary files were retained at %s.\n' "$mount" "$work" >&2
    exit 1
  fi
  rm -rf -- "$work"
  if [[ $status == 0 ]]; then
    printf 'Verified bapX Agents v%s arm64 release candidate at %s.\n' "$version" "$source_sha"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Match Apple-issued Developer ID Application certificates and compare the leaf certificates below.
developer_id='=anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists'
verify_signature() {
  local target=$1 certificate_prefix=$2
  shift 2
  codesign --verify --strict --verbose=2 --test-requirement "$developer_id" "$@" "$target"
  codesign --display --extract-certificates="$certificate_prefix" "$target"
  [[ -s ${certificate_prefix}0 ]] || die "Could not extract the signing certificate: $target"
}

verify_app() {
  local app=$1 certificate_prefix=$2 plist executable
  [[ -d $app && ! -L $app ]] || die "Expected an app bundle: $app"
  verify_signature "$app" "$certificate_prefix" --deep
  plist="$app/Contents/Info.plist"
  [[ $(plutil -extract CFBundleIdentifier raw -o - "$plist") == in.bapx.agents ]] || die "Unexpected bundle identifier: $app"
  [[ $(plutil -extract CFBundleShortVersionString raw -o - "$plist") == "$version" ]] || die "Unexpected bundle version: $app"
  [[ $(plutil -extract BapXSourceCommit raw -o - "$plist") == "$source_sha" ]] || die "Unexpected or missing source SHA: $app"
  executable=$(plutil -extract CFBundleExecutable raw -o - "$plist")
  case $executable in
    ''|.|..|*/*) die "Invalid bundle executable: $app" ;;
  esac
  [[ $(xcrun lipo -archs "$app/Contents/MacOS/$executable") == arm64 ]] || die "Expected an arm64 executable: $app"
  xcrun stapler validate "$app"
  spctl --assess --type exec --verbose=2 "$app"
}

hdiutil verify "$dmg"
verify_signature "$dmg" "$work/dmg-cert-"
xcrun stapler validate "$dmg"
spctl --assess --type open --context context:primary-signature --verbose=2 "$dmg"

mkdir "$mount" "$work/zip"
hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$mount" "$dmg"
verify_app "$mount/bapX Agents.app" "$work/dmg-app-cert-"
cmp -s "$work/dmg-cert-0" "$work/dmg-app-cert-0" || die "The DMG and mounted app have different signing certificates."

# Preserve AppleDouble metadata while keeping tar's path and symlink checks enabled.
/usr/bin/tar --mac-metadata -xf "$zip" -C "$work/zip"
verify_app "$work/zip/bapX Agents.app" "$work/zip-app-cert-"
cmp -s "$work/dmg-cert-0" "$work/zip-app-cert-0" || die "The DMG and ZIP app have different signing certificates."
