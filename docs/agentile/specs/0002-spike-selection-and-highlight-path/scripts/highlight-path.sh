#!/usr/bin/env bash
# Spike-only, reproducible driver for questions 5-7 (highlight path).
# Re-fetches Zed's queries, builds the grammars from a shallow clone, runs
# `tree-sitter query` with Zed's highlights.scm against the fixtures, resolves
# captures against the live theme, and times the query.
#
# Safe to re-run; does not touch ~/.config/tree-sitter. Grammar clones and
# .so builds land under grammars/ (gitignored). Note: `tree-sitter build
# --output ...` also writes a copy of each compiled parser to the CLI's own
# cache dir, ~/.cache/tree-sitter/lib/<name>.so - this is the tool's normal
# behaviour (like `npm install` populating ~/.npm), not project state; it is
# left in place rather than cleaned up.
set -euo pipefail

SPEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SPEC_DIR"

ZED_TAG="v1.18.1"
ZED_TS_TYPESCRIPT_REV="e2c53597d6a5d9cf7bbe8dccde576fe1e46c5899"
ZED_TS_PYTHON_TAG="v0.25.0"

echo "== fetching Zed's highlight queries (tag $ZED_TAG) =="
mkdir -p zed-queries/javascript zed-queries/python
curl -sf -o zed-queries/javascript/highlights.scm \
  "https://raw.githubusercontent.com/zed-industries/zed/${ZED_TAG}/crates/grammars/src/javascript/highlights.scm"
curl -sf -o zed-queries/python/highlights.scm \
  "https://raw.githubusercontent.com/zed-industries/zed/${ZED_TAG}/crates/grammars/src/python/highlights.scm"

echo "== cloning grammars (pinned to what Zed $ZED_TAG actually uses) =="
mkdir -p grammars
if [ ! -d grammars/tree-sitter-python ]; then
  git clone --quiet --depth 1 --branch "$ZED_TS_PYTHON_TAG" \
    https://github.com/tree-sitter/tree-sitter-python grammars/tree-sitter-python
fi
if [ ! -d grammars/tree-sitter-typescript-zed ]; then
  git clone --quiet --no-checkout \
    https://github.com/zed-industries/tree-sitter-typescript grammars/tree-sitter-typescript-zed
  (cd grammars/tree-sitter-typescript-zed && git fetch --quiet --depth 1 origin "$ZED_TS_TYPESCRIPT_REV" && git checkout --quiet FETCH_HEAD)
fi
# Plain upstream tree-sitter-javascript kept only as a *negative* control: Zed
# does not actually use it for .js (see SOURCE files + findings.md Q5).
if [ ! -d grammars/tree-sitter-javascript ]; then
  git clone --quiet --depth 1 https://github.com/tree-sitter/tree-sitter-javascript grammars/tree-sitter-javascript
fi

echo "== building .so files =="
mkdir -p grammars/lib
tree-sitter build --output grammars/lib/python.so grammars/tree-sitter-python
tree-sitter build --output grammars/lib/tsx.so grammars/tree-sitter-typescript-zed/tsx
tree-sitter build --output grammars/lib/javascript.so grammars/tree-sitter-javascript

mkdir -p out

echo "== Q5: run Zed's javascript queries against the tsx grammar (what Zed actually parses .js with) =="
tree-sitter query --lib-path grammars/lib/tsx.so --lang-name tsx -c \
  zed-queries/javascript/highlights.scm fixtures/sample.js | tee out/query-js.txt

echo "== Q5 (negative control): same query against plain tree-sitter-javascript =="
# --lib-path/--lang-name against the .so already built above, not -p: -p
# would rebuild via the CLI's own cache and write a copy to
# ~/.cache/tree-sitter/lib/javascript.so as a side effect.
tree-sitter query --lib-path grammars/lib/javascript.so --lang-name javascript -c \
  zed-queries/javascript/highlights.scm fixtures/sample.js > out/query-js-plain.txt 2>out/query-js-plain.err || true
cat out/query-js-plain.err

echo "== Q5: run Zed's python queries against tree-sitter-python =="
tree-sitter query --lib-path grammars/lib/python.so --lang-name python -c \
  zed-queries/python/highlights.scm fixtures/sample.py | tee out/query-py.txt

echo "== Q6: capture -> theme resolution =="
grep -ohE '@[A-Za-z_.]+' zed-queries/javascript/highlights.scm | sort -u | tr -d '@' > out/captures-js-declared.txt
grep -ohE '@[A-Za-z_.]+' zed-queries/python/highlights.scm | sort -u | tr -d '@' > out/captures-py-declared.txt
node -e '
const fs = require("node:fs");
const j = JSON.parse(fs.readFileSync(process.env.HOME + "/.local/state/omarchy/current/theme/zed-theme.json", "utf8"));
const style = j.themes ? j.themes[0].style : j.style;
fs.writeFileSync("out/theme-syntax-keys.json", JSON.stringify(Object.keys(style.syntax)));
'
node scripts/resolve-captures.mjs out/theme-syntax-keys.json out/captures-js-declared.txt --fired out/query-js.txt | tee out/resolve-js.txt
node scripts/resolve-captures.mjs out/theme-syntax-keys.json out/captures-py-declared.txt --fired out/query-py.txt | tee out/resolve-py.txt

echo "== Q7: timing (10 runs each, prebuilt .so, process start included) =="
bash scripts/time-query.sh grammars/lib/tsx.so tsx zed-queries/javascript/highlights.scm fixtures/sample.js
bash scripts/time-query.sh grammars/lib/python.so python zed-queries/python/highlights.scm fixtures/sample.py

echo "== done: see out/ for raw evidence, findings.md for the write-up =="
