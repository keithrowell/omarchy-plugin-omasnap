#!/usr/bin/env bash
# Dev-time, network-using vendoring script for the VS Code highlighter.
# Re-run this to bump a pin; it is never run at install time or on the
# highlighter's run path.
#
#   tools/vendor-textmate.sh
#
# Vendors exactly two npm packages (the tokenizer engine VS Code itself
# uses) as their published `release/` build output — no npm install, no
# node_modules, no build step: vscode-oniguruma ships a prebuilt WASM
# binary and vscode-textmate is plain JS. Grammar *files* are NOT vendored
# here — see lib/vscode-extensions.mjs's header for why: they're read
# directly from the installed VS Code / its extensions at snap time.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/vendor/textmate"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

TEXTMATE_VERSION="9.3.2"
ONIGURUMA_VERSION="2.0.1"
DATE="$(date -u +%Y-%m-%d)"

say() { printf '%s\n' "$*"; }

vendor_pkg() {
  local name="$1" version="$2"
  local dest="$DEST/$name"
  say "textmate: vendoring $name@$version"
  npm pack "$name@$version" --silent --pack-destination "$WORK" >/dev/null
  local tgz
  tgz="$(ls "$WORK/$name"-*.tgz)"
  local extract="$WORK/extract-$name"
  mkdir -p "$extract"
  tar xzf "$tgz" -C "$extract" --strip-components=1

  rm -rf "$dest"
  mkdir -p "$dest/release"
  cp "$extract/release/main.js" "$dest/release/main.js"
  [ -f "$extract/release/onig.wasm" ] && cp "$extract/release/onig.wasm" "$dest/release/onig.wasm"

  local licence
  for lic in LICENSE.md LICENSE.txt LICENSE; do
    if [ -f "$extract/$lic" ]; then
      cp "$extract/$lic" "$dest/LICENSE"
      licence="$lic"
      break
    fi
  done

  {
    echo "package: $name"
    echo "version: $version"
    echo "source:  npm registry (npm pack $name@$version)"
    echo "fetched: $DATE"
    echo "licence: $licence"
  } >"$dest/SOURCE"

  say "textmate: vendored $name@$version -> vendor/textmate/$name"
}

vendor_pkg vscode-textmate "$TEXTMATE_VERSION"
vendor_pkg vscode-oniguruma "$ONIGURUMA_VERSION"

say "done. vendor/textmate updated."
