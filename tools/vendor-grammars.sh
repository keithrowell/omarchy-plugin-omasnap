#!/usr/bin/env bash
# Dev-time, network-using vendoring script for spec 0005 (zed-highlighter).
# Re-run this to bump a pin or add a language; it is never run at install
# time or on the highlighter's run path (see docs/adr/0002-grammar-sourcing.md).
#
#   tools/vendor-grammars.sh                 # vendor every grammar + query set
#   tools/vendor-grammars.sh tsx python       # only these grammars (by grammar name)
#   tools/vendor-grammars.sh --queries-only   # re-fetch just the Zed query files
#
# For each grammar: shallow-clones the pinned repo (a tag with --branch, a
# commit with --no-checkout + fetch --depth 1 <rev>), copies the minimal
# file set (src/{parser.c,scanner.c,scanner.cc,grammar.json,node-types.json,
# tree_sitter/}, tree-sitter.json, the licence) into
# vendor/grammars/<name>/, and writes a SOURCE file recording repo/subdir/
# ref/date/licence. For each query set: downloads highlights.scm (and
# injections.scm, when Zed has one) into vendor/zed-queries/<lang>/ with its
# own SOURCE, and appends a row to vendor/zed-queries/SOURCE.md.
#
# Idempotent: an already-vendored grammar/query dir is left alone unless
# --force is given. Never touches ~/.config/tree-sitter or vendor/grammars/lib
# (bin/build-grammars owns that).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRAMMARS_DIR="$ROOT/vendor/grammars"
QUERIES_DIR="$ROOT/vendor/zed-queries"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Populated by vendor_query() as it resolves a branch ref (e.g. "main") to
# the actual commit it fetched, so SOURCE.md records real commits instead of
# a moving branch name.
declare -A RESOLVED_REF

ZED_TAG="v1.18.1"
ZED_COMMIT="bebe92f469834a287f5a57ed78e8d51a918b8ada"
DATE="$(date -u +%Y-%m-%d)"

FORCE=0
QUERIES_ONLY=0
WANT=()
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --queries-only) QUERIES_ONLY=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) WANT+=("$arg") ;;
  esac
done

say() { printf '%s\n' "$*"; }

# Grammar pin table: name | repo | subdir ("" = repo root) | ref | ref-kind (tag|commit) | licence-file
GRAMMAR_TABLE=(
  "tsx|https://github.com/zed-industries/tree-sitter-typescript|tsx|e2c53597d6a5d9cf7bbe8dccde576fe1e46c5899|commit|LICENSE"
  "typescript|https://github.com/zed-industries/tree-sitter-typescript|typescript|e2c53597d6a5d9cf7bbe8dccde576fe1e46c5899|commit|LICENSE"
  "python|https://github.com/tree-sitter/tree-sitter-python||v0.25.0|tag|LICENSE"
  "rust|https://github.com/tree-sitter/tree-sitter-rust||v0.24.2|tag|LICENSE"
  "c|https://github.com/tree-sitter/tree-sitter-c||v0.24.1|tag|LICENSE"
  "bash|https://github.com/tree-sitter/tree-sitter-bash||v0.25.1|tag|LICENSE"
  "json|https://github.com/tree-sitter/tree-sitter-json||v0.24.8|tag|LICENSE"
  "yaml|https://github.com/zed-industries/tree-sitter-yaml||baff0b51c64ef6a1fb1f8390f3ad6015b83ec13a|commit|LICENSE"
  "markdown|https://github.com/zed-industries/tree-sitter-markdown|tree-sitter-markdown|b596e737286780d7bfa9fcddceaeeb754574b352|commit|LICENSE"
  "markdown_inline|https://github.com/zed-industries/tree-sitter-markdown|tree-sitter-markdown-inline|b596e737286780d7bfa9fcddceaeeb754574b352|commit|LICENSE"
  "ruby|https://github.com/tree-sitter/tree-sitter-ruby||71bd32fb7607035768799732addba884a37a6210|commit|LICENSE"
  "lua|https://github.com/tree-sitter-grammars/tree-sitter-lua||10fe0054734eec83049514ea2e718b2a56acd0c9|commit|LICENSE"
)

# Query pin table: lang | kind (zed-builtin|zed-extension) | path-in-repo | repo-url | ref
QUERY_TABLE=(
  "javascript|zed-builtin|javascript|https://github.com/zed-industries/zed|$ZED_TAG"
  "typescript|zed-builtin|typescript|https://github.com/zed-industries/zed|$ZED_TAG"
  "tsx|zed-builtin|tsx|https://github.com/zed-industries/zed|$ZED_TAG"
  "python|zed-builtin|python|https://github.com/zed-industries/zed|$ZED_TAG"
  "rust|zed-builtin|rust|https://github.com/zed-industries/zed|$ZED_TAG"
  "c|zed-builtin|c|https://github.com/zed-industries/zed|$ZED_TAG"
  "bash|zed-builtin|bash|https://github.com/zed-industries/zed|$ZED_TAG"
  "json|zed-builtin|json|https://github.com/zed-industries/zed|$ZED_TAG"
  "yaml|zed-builtin|yaml|https://github.com/zed-industries/zed|$ZED_TAG"
  "markdown|zed-builtin|markdown|https://github.com/zed-industries/zed|$ZED_TAG"
  "ruby|zed-extension|ruby|https://github.com/zed-extensions/ruby|main"
  "lua|zed-extension|lua|https://github.com/zed-extensions/lua|main"
)

wanted() {
  local name="$1"
  [ "${#WANT[@]}" -eq 0 ] && return 0
  for w in "${WANT[@]}"; do [ "$w" = "$name" ] && return 0; done
  return 1
}

clone_pin() {
  # clone_pin <dest> <repo> <ref> <ref-kind>
  local dest="$1" repo="$2" ref="$3" kind="$4"
  if [ "$kind" = "tag" ]; then
    git clone --quiet --depth 1 --branch "$ref" "$repo" "$dest"
  else
    git clone --quiet --no-checkout "$repo" "$dest"
    (cd "$dest" && git fetch --quiet --depth 1 origin "$ref" && git checkout --quiet FETCH_HEAD)
  fi
}

vendor_grammar() {
  local row="$1"
  IFS='|' read -r name repo subdir ref kind licence <<<"$row"
  wanted "$name" || return 0

  local dest="$GRAMMARS_DIR/$name"
  # Checks for SOURCE itself, not just the directory: a run that failed
  # partway can leave an empty/incomplete dest behind, which should be
  # retried rather than reported as already-vendored.
  if [ -f "$dest/SOURCE" ] && [ "$FORCE" -ne 1 ]; then
    say "grammar: unchanged $name (already vendored; --force to re-vendor)"
    return 0
  fi

  say "grammar: vendoring $name from $repo${subdir:+/$subdir} @ $ref"
  local clone="$WORK/$name"
  clone_pin "$clone" "$repo" "$ref" "$kind"

  local src="$clone"
  [ -n "$subdir" ] && src="$clone/$subdir"

  rm -rf "$dest"
  mkdir -p "$dest/src"

  # Every top-level .c/.h/.cc file under src/ (not just parser.c/scanner.c):
  # some grammars (e.g. Zed's yaml fork) split their external scanner across
  # extra files like schema.core.c, #include'd by scanner.c itself.
  for f in "$src"/src/*.c "$src"/src/*.cc "$src"/src/*.h "$src"/src/grammar.json "$src"/src/node-types.json; do
    [ -f "$f" ] && cp "$f" "$dest/src/$(basename "$f")"
  done
  [ -d "$src/src/tree_sitter" ] && cp -r "$src/src/tree_sitter" "$dest/src/tree_sitter"

  # The typescript fork's scanner.c includes "../../common/scanner.h" (a
  # scanner shared by the typescript/tsx/jsdoc subdirs of that repo) — the
  # relative include already resolves correctly from vendor/grammars/<name>/
  # src/scanner.c to vendor/grammars/common/scanner.h, so it is copied
  # as-is, with no path rewriting needed.
  local common_scanner_note=""
  if [ -f "$dest/src/scanner.c" ] && grep -q 'common/scanner.h' "$dest/src/scanner.c" 2>/dev/null; then
    mkdir -p "$GRAMMARS_DIR/common"
    cp "$clone/common/scanner.h" "$GRAMMARS_DIR/common/scanner.h"
    common_scanner_note="common/scanner.h: shared with tsx/typescript, from the same $repo @ $ref (../../common/scanner.h, relative to this grammar's src/scanner.c)"
  fi

  if [ -f "$src/tree-sitter.json" ]; then
    cp "$src/tree-sitter.json" "$dest/tree-sitter.json"
  else
    printf '{\n  "grammars": [ { "name": "%s", "camelcase": "%s", "scope": "source.%s" } ]\n}\n' \
      "$name" "$name" "$name" >"$dest/tree-sitter.json"
  fi

  for lic in "$clone/$licence" "$clone/LICENSE" "$clone/LICENSE.txt" "$clone/LICENSE.md"; do
    if [ -f "$lic" ]; then
      cp "$lic" "$dest/LICENSE"
      break
    fi
  done

  {
    echo "repo:    $repo"
    [ -n "$subdir" ] && echo "subdir:  $subdir"
    echo "ref:     $ref ($kind)"
    echo "fetched: $DATE"
    echo "licence: $(basename "${lic:-unknown}")"
    [ -n "$common_scanner_note" ] && echo "note:    $common_scanner_note"
  } >"$dest/SOURCE"

  say "grammar: vendored $name"
}

# Resolve a branch-like ref (e.g. "main") to the commit it currently points
# at, via `git ls-remote <repo> HEAD` — so a re-vendor six months from now
# can't silently record "main" while actually having fetched whatever commit
# was current on the day this ran. A ref that is already a full commit sha is
# returned unchanged (no network needed); resolution failure (offline, repo
# renamed) falls back to the literal ref rather than failing the whole run.
resolve_ref() {
  local repo="$1" ref="$2"
  if [[ "$ref" =~ ^[0-9a-f]{40}$ ]]; then
    echo "$ref"
    return
  fi
  local resolved
  resolved="$(git ls-remote "$repo" HEAD 2>/dev/null | cut -f1)"
  if [[ "$resolved" =~ ^[0-9a-f]{40}$ ]]; then
    echo "$resolved"
  else
    echo "$ref"
  fi
}

vendor_query() {
  local row="$1"
  IFS='|' read -r lang kind path repo ref <<<"$row"
  wanted "$lang" || return 0

  local dest="$QUERIES_DIR/$lang"
  # Checks for highlights.scm itself, not just the directory: a run that
  # failed partway (e.g. a wrong URL) can leave an empty dest behind, which
  # should be retried rather than reported as already-vendored.
  if [ -f "$dest/highlights.scm" ] && [ "$FORCE" -ne 1 ]; then
    say "query: unchanged $lang (already vendored; --force to re-vendor)"
    return 0
  fi
  mkdir -p "$dest"

  local raw_base
  if [ "$kind" = "zed-builtin" ]; then
    raw_base="${repo/github.com/raw.githubusercontent.com}/$ref/crates/grammars/src/$path"
  else
    raw_base="${repo/github.com/raw.githubusercontent.com}/$ref/languages/$path"
  fi

  # Fetch by branch/tag name (raw_base above), but record the actual commit
  # that name resolved to at fetch time — a branch like "main" moves, and
  # SOURCE should say what was really vendored, not a name that will drift.
  local resolved_ref
  resolved_ref="$(resolve_ref "$repo" "$ref")"
  RESOLVED_REF["$lang"]="$resolved_ref"

  say "query: fetching $lang from $raw_base"
  curl -sf -o "$dest/highlights.scm" "$raw_base/highlights.scm"
  if curl -sf -o "$dest/injections.scm.tmp" "$raw_base/injections.scm" 2>/dev/null; then
    mv "$dest/injections.scm.tmp" "$dest/injections.scm"
  else
    rm -f "$dest/injections.scm.tmp"
  fi

  # Zed built-in queries are covered by vendor/zed-queries/LICENSE
  # (Zed's own LICENSE-GPL, fetched once, top-level); an extension repo's
  # queries carry their own licence, fetched per language here.
  local licence_note="see ../LICENSE (Zed's own, GPL-3.0)"
  if [ "$kind" = "zed-extension" ]; then
    local repo_raw="${repo/github.com/raw.githubusercontent.com}/$ref"
    for lic in LICENSE-APACHE LICENSE LICENSE.md; do
      if curl -sf -o "$dest/LICENSE" "$repo_raw/$lic" 2>/dev/null; then
        licence_note="./LICENSE (fetched from $repo/blob/$ref/$lic)"
        break
      fi
    done
  fi

  {
    echo "url:     $raw_base/highlights.scm"
    echo "repo:    $repo"
    echo "ref:     $resolved_ref"
    echo "fetched: $DATE"
    echo "licence: $licence_note"
  } >"$dest/SOURCE"

  say "query: vendored $lang"
}

if [ "$QUERIES_ONLY" -ne 1 ]; then
  for row in "${GRAMMAR_TABLE[@]}"; do vendor_grammar "$row"; done
fi
for row in "${QUERY_TABLE[@]}"; do vendor_query "$row"; done

mkdir -p "$QUERIES_DIR"
{
  echo "# Zed query sources"
  echo
  echo "Zed version: $ZED_TAG ($ZED_COMMIT). Re-run \`tools/vendor-grammars.sh\` after"
  echo "bumping \`ZED_TAG\`/\`ZED_COMMIT\` at the top of that script."
  echo
  echo "| language | source | ref |"
  echo "|---|---|---|"
  for row in "${QUERY_TABLE[@]}"; do
    IFS='|' read -r lang kind path repo ref <<<"$row"
    # Prefer the ref actually recorded in that language's own SOURCE file
    # (a resolved commit, for branch-tracked extension queries) over the
    # table's static ref (which may just say "main"), so this table stays
    # accurate even for languages not touched by the current invocation.
    source_ref="$(sed -n 's/^ref: *//p' "$QUERIES_DIR/$lang/SOURCE" 2>/dev/null | head -1)"
    echo "| $lang | $repo | ${source_ref:-$ref} |"
  done
} >"$QUERIES_DIR/SOURCE.md"

say "done. vendor/grammars and vendor/zed-queries updated; run bin/build-grammars to compile."
