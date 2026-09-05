#!/usr/bin/env bash
# Spike-only. Times `tree-sitter query` against a prebuilt .so ten times,
# reporting wall-clock deltas in milliseconds (process start included).
set -euo pipefail

SPEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB_PATH="$1"       # e.g. grammars/lib/tsx.so
LANG_NAME="$2"      # e.g. tsx
QUERY_FILE="$3"     # e.g. zed-queries/javascript/highlights.scm
SOURCE_FILE="$4"    # e.g. fixtures/sample.js

cd "$SPEC_DIR"

for i in $(seq 1 10); do
  start=$(date +%s%N)
  tree-sitter query --lib-path "$LIB_PATH" --lang-name "$LANG_NAME" -q -c "$QUERY_FILE" "$SOURCE_FILE" >/dev/null 2>/dev/null
  end=$(date +%s%N)
  echo "run $i: $(( (end - start) / 1000000 )) ms"
done
