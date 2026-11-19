#!/usr/bin/env bash
set -euo pipefail

name="$(node -p 'require("./package.json").name')"
version="$(node -p 'require("./package.json").version')"
if [[ "$GITHUB_REF_NAME" != "v$version" ]]; then
  echo "Release tag $GITHUB_REF_NAME does not match package version $version" >&2
  exit 1
fi

web_archive="release-assets/$name-$version-web.zip"
portable_archive="release-assets/$name-$version-windows-x64-portable.zip"
for asset in "$web_archive" "$portable_archive"; do
  if [[ ! -s "$asset" ]]; then
    echo "Missing or empty release asset: $asset" >&2
    exit 1
  fi
done
unzip -t "$web_archive"
unzip -t "$portable_archive"

node scripts/release-downloads.mjs

printf 'title=%s %s\n' "$name" "$version" >> "$GITHUB_OUTPUT"

node scripts/release-notes.mjs > release-notes.md
