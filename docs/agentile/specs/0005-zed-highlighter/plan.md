# Plan — Zed highlighter: tree-sitter with Zed's queries, coloured from the Zed Omarchy theme

Written by the plan stage. The build stage follows what it says. This is
the largest spec so far; it has a **priority order** (below) so that a
timebox overrun ships a smaller language set rather than nothing. Logic in
`lib/`, tests in `tests/`, vendored assets in `vendor/`. ADR-0002 (drafted
with this plan) records the grammar-sourcing decision; the builder does not
re-litigate it.

## Files to touch

| File | Why |
|---|---|
| `lib/language.mjs` | `detectLanguage({ filename, text })`, `LANGUAGES` table (id → grammar, query dir, suffixes, shebangs). |
| `lib/highlight/zed.mjs` | `highlight({ text, language, theme, root })`, `parseQueryOutput(text)`, `spansFromCaptures(...)`; header comment records the engine choice and why. |
| `bin/build-grammars` | Compiles every `vendor/grammars/<name>/` into `vendor/grammars/lib/<name>.so` with `tree-sitter build`; idempotent; `--check` mode lists what is missing/stale. |
| `bin/install` | Runs `bin/build-grammars` after the package check; `README.md` package line gains `tree-sitter-cli` + `gcc` and **drops** the `tree-sitter-*` grammar packages (ADR-0002). |
| `bin/omasnap` | Before rendering, if a needed `.so` is missing, print a one-line hint to run `bin/install` (the highlighter itself degrades to plain spans). |
| `vendor/grammars/<name>/{src/,tree-sitter.json,LICENSE,SOURCE}` | Grammar sources at Zed's pins (see table). |
| `vendor/grammars/.gitignore` | `lib/` |
| `vendor/zed-queries/<lang>/{highlights.scm,injections.scm?,SOURCE}` + `vendor/zed-queries/SOURCE.md` + `vendor/zed-queries/LICENSE` | Zed's queries at `v1.18.1` (built-ins) or the extension repo commit (ruby, lua); Zed's licence (GPL-3.0 for the app repo — check the repo's `LICENSE-GPL`; the `crates/grammars` queries are under it) recorded in `SOURCE.md`. |
| `tools/vendor-grammars.sh` | The re-vendoring script (network, dev-time only): clones each repo at its pin, copies the minimal file set, writes `SOURCE`. Also fetches the queries. Committed so the next Zed bump is one command. |
| `tests/fixtures/code/<lang>.<ext>` | One fixture per language (10–30 lines) with a keyword, a string, a comment and a function/definition name. |
| `tests/language.test.mjs`, `tests/highlight-zed.test.mjs` | Behaviour tests (below). |
| `docs/agentile/specs/0005-zed-highlighter/side-by-side.md` (+ PNGs) | The Zed comparison record. |
| `README.md` | Supported languages, the grammar build step, package line. |
| `.gitignore` | add `vendor/grammars/lib/`. |

## Environment facts (verified at plan time, 2026-09-06)

- Machine is **aarch64**; gcc 16; tree-sitter CLI 0.26.9; Zed 1.18.1
  (commit `bebe92f4`). Network to GitHub works (dev-time only).
- `tree-sitter build -o <out.so> <grammar-dir>` compiles from just
  `src/parser.c` (+ `src/scanner.c`, `src/tree_sitter/*.h`,
  `src/grammar.json`, `src/node-types.json`) and `tree-sitter.json`; a
  minimal `tree-sitter-json` dir built in 0.1 s. Zed's `tsx` and
  `typescript` `parser.c` are 8.4 MB each (expect ~30–60 s each to compile;
  measure and record).
- Engine contract (verified with the pacman Lua grammar):

  ```
  $ tree-sitter query --lib-path <lang>.so --lang-name <name> -c <highlights.scm> <file>
  <file>
      pattern:  1, capture: 1 - keyword, start: (0, 0), end: (0, 5), text: `local`
      pattern: 19, capture: 10 - variable, start: (0, 6), end: (0, 7), text: `x`
  ```

  One line per capture, ordered by position; `start`/`end` are
  `(row, byteColumn)`; **ignore the `text:` field** (it may contain
  backticks and newlines) and use the ranges. A "You have not configured any
  parser directories" warning goes to stderr; ignore it (or pass
  `--config-path` to an empty JSON `{}` in the runtime dir — try it, keep
  whichever is quieter). Predicates (`#match?`, `#eq?`, `#any-of?`) are
  applied by the CLI. Columns are **bytes**: convert to JS string indices per
  line with `Buffer.byteLength` / `TextDecoder` slicing so non-ASCII text is
  split correctly.
- Zed's built-in grammar dirs at `v1.18.1` (`crates/grammars/src/`): `bash c
  cpp css diff gitcommit go gomod gowork javascript jsdoc json jsonc
  markdown-inline markdown python regex rust tsx typescript yaml
  zed-keybind-context`. Each has `config.toml` (with `grammar = "…"` and
  `path_suffixes`), `highlights.scm`, usually `injections.scm`. The
  `javascript` dir sets `grammar = "tsx"`.
- Zed's grammar pins at `v1.18.1` (`Cargo.lock`), and the extension pins:

  | id | grammar name | source | pin |
  |---|---|---|---|
  | javascript, jsx, tsx | `tsx` | `github.com/zed-industries/tree-sitter-typescript` (`tsx/` subdir) | `e2c53597d6a5d9cf7bbe8dccde576fe1e46c5899` |
  | typescript | `typescript` | same repo, `typescript/` subdir (shares `common/scanner.h` — copy it too) | same rev |
  | python | `python` | `github.com/tree-sitter/tree-sitter-python` | tag `v0.25.0` |
  | rust | `rust` | `github.com/tree-sitter/tree-sitter-rust` | tag `v0.24.2` |
  | c | `c` | `github.com/tree-sitter/tree-sitter-c` | tag `v0.24.1` |
  | bash | `bash` | `github.com/tree-sitter/tree-sitter-bash` | tag `v0.25.1` |
  | json | `json` | `github.com/tree-sitter/tree-sitter-json` | tag `v0.24.8` |
  | yaml | `yaml` | `github.com/zed-industries/tree-sitter-yaml` | `baff0b51c64ef6a1fb1f8390f3ad6015b83ec13a` |
  | markdown | `markdown` + `markdown_inline` | `github.com/zed-industries/tree-sitter-markdown` (`tree-sitter-markdown/` and `tree-sitter-markdown-inline/` subdirs) | `b596e737286780d7bfa9fcddceaeeb754574b352` |
  | ruby | `ruby` | `github.com/tree-sitter/tree-sitter-ruby` | `71bd32fb7607035768799732addba884a37a6210` (from `zed-extensions/ruby` `extension.toml`); queries at `zed-extensions/ruby` `languages/ruby/highlights.scm` (record the extension repo commit) |
  | lua | `lua` | `github.com/tree-sitter-grammars/tree-sitter-lua` | `10fe0054734eec83049514ea2e718b2a56acd0c9` (v0.5.0, from `zed-extensions/lua`); queries at `zed-extensions/lua` `languages/lua/highlights.scm` |

  If a crates.io tag does not exist under that name, use the matching
  release tag or commit and record it in `SOURCE`.
- Theme side: `lib/theme.mjs` (`readTheme`, `zedSyntaxStyle`) shipped in
  spec 0003; `theme.zed.syntax` holds 39 keys for the live theme; the spike
  showed every capture Zed's JS/Python queries fire resolves via
  `zedSyntaxStyle`'s dotted fallback.
- The renderer (spec 0004) consumes `{ text, color, fontStyle, fontWeight }`
  spans per line via `lib/input.mjs`'s `resolveSpans` (explicit `color`
  passes through) — the highlighter's output plugs straight in.

## Priority order (timebox insurance)

1. Engine + `javascript` (tsx grammar) + `python`: end to end with tests.
2. `typescript`, `tsx`, `rust`, `c`, `bash`, `json` (all built-ins with
   simple pins).
3. `yaml`, `markdown` (Zed forks; markdown builds two grammars; inline
   injection is **not** implemented in this spec — the block grammar's
   highlights only; say so in the header).
4. `ruby`, `lua` (extension repos).
5. Side-by-side record, README, `bin/omasnap` hint.

If the build runs long, stop after a complete tier, list the missing
languages in the report, and keep `detectLanguage` covering every id
(unbuilt grammar → plain spans + a `console.warn`), so later work is
additive.

## Approach

### `lib/language.mjs`

```js
export const LANGUAGES = {
  javascript: { grammar: "tsx",        queries: "javascript", suffixes: ["js", "mjs", "cjs", "jsx"], shebangs: ["node"] },
  typescript: { grammar: "typescript", queries: "typescript", suffixes: ["ts", "mts", "cts"] },
  tsx:        { grammar: "tsx",        queries: "tsx",        suffixes: ["tsx"] },
  python:     { grammar: "python",     queries: "python",     suffixes: ["py", "pyi", "pyw"], shebangs: ["python", "python3"] },
  rust:       { grammar: "rust",       queries: "rust",       suffixes: ["rs"] },
  c:          { grammar: "c",          queries: "c",          suffixes: ["c", "h"] },
  bash:       { grammar: "bash",       queries: "bash",       suffixes: ["sh", "bash", "zsh"], shebangs: ["sh", "bash", "zsh"], filenames: [".bashrc", ".zshrc", "PKGBUILD"] },
  json:       { grammar: "json",       queries: "json",       suffixes: ["json", "jsonc"] },
  yaml:       { grammar: "yaml",       queries: "yaml",       suffixes: ["yml", "yaml"] },
  markdown:   { grammar: "markdown",   queries: "markdown",   suffixes: ["md", "markdown"] },
  ruby:       { grammar: "ruby",       queries: "ruby",       suffixes: ["rb", "rake", "gemspec"], shebangs: ["ruby"], filenames: ["Gemfile", "Rakefile"] },
  lua:        { grammar: "lua",        queries: "lua",        suffixes: ["lua"], shebangs: ["lua"] },
};
export function detectLanguage({ filename, text }) → id | null
```

Take the suffixes from each Zed `config.toml`'s `path_suffixes` where
present (record in a comment). Detection order: exact filename → suffix
(case-insensitive, last dot) → shebang on the first line (`#!/usr/bin/env
python3`, `#!/bin/bash`, `#!/usr/bin/python`; match the interpreter's
basename with a trailing version stripped) → `null`. Pure, no I/O.

### `lib/highlight/zed.mjs`

```js
export function highlight({ text, language, theme, root = REPO_ROOT, runQuery }) → { lines: [[{ text, color, fontStyle, fontWeight }]], language, warnings: [] }
export function parseQueryOutput(stdout) → [{ pattern, capture, start: {row, col}, end: {row, col} }]
export function spansFromCaptures({ text, captures, theme }) → lines
```

- **Header comment**: engine = tree-sitter CLI `query` subcommand with
  `--lib-path`/`--lang-name` against `vendor/grammars/lib/<grammar>.so`,
  because the spike measured ~86 ms for a 60-line JS file including process
  start and the CLI applies Zed's predicates unmodified; no Node binding or
  WASM; grammar sourcing per ADR-0002; injections not implemented (list
  what that costs: template-literal CSS/HTML, markdown fenced blocks,
  regex literals).
- `highlight`: `language` null or unknown, or the `.so` / query file missing
  → one plain span per line in `theme.zed.style.editorForeground` (or
  `theme.colors.foreground` when `zed` is null) with a warning string; never
  throws for those cases. Otherwise write `text` to a temp file under
  `${XDG_RUNTIME_DIR ?? tmpdir()}/omasnap/` (mode 0600, removed in
  `finally`), run `execFileSync("tree-sitter", ["query", "--lib-path", so,
  "--lang-name", grammar, "-c", scm, tmp], { encoding: "utf8", stdio:
  ["ignore", "pipe", "pipe"] })` (no shell; the selection never touches
  argv), parse stdout, build spans. `runQuery` is an injectable override
  for tests that want to feed canned output. A non-zero exit → warn and
  return plain spans (the spec's "never fail").
- `spansFromCaptures` — **tree-sitter-highlight semantics**, documented in
  the module: process captures in output order; keep a stack of active
  highlights; a capture whose range equals an already-highlighted node's
  exact range does **not** override it (first pattern wins for the same
  node); a capture strictly inside an active range overrides it within its
  own range (inner wins); ranges are byte-based and converted to string
  indices per line. Each capture's style = `zedSyntaxStyle(theme.zed,
  captureName)` (so `punctuation.bracket.x` → `punctuation.bracket` →
  `punctuation`, and a capture with no theme entry falls back to the editor
  foreground exactly as Zed does). Then split each line into spans: adjacent
  characters with the same style merge; uncaptured text is a plain span in
  the editor foreground. **Invariant**: for every line, the concatenation
  of span texts equals the original line (tabs and trailing whitespace
  preserved). Lines are split on `\n`; a `\r` before it is kept in the last
  span of the line (spec: mixed line endings preserved); a missing trailing
  newline does not add an empty line.
- Zed's `@property` vs `@variable` and similar ordering quirks are exactly
  what the side-by-side check exists for; if Zed visibly disagrees with the
  first-pattern-wins rule on a fixture token, switch that rule to
  last-pattern-wins **globally**, re-run every test, and record the finding
  in the header and `side-by-side.md`.
- Performance: one process per call; no caching of anything theme-related.
  Grammar `.so` lookup: `vendor/grammars/lib/<grammar>.so` under `root`.

### `bin/build-grammars` and `tools/vendor-grammars.sh`

- `tools/vendor-grammars.sh` (dev-time, network): for each row of the pin
  table, clone at the pin (shallow, `--no-checkout` + `fetch --depth 1 <rev>`
  for commits; `--branch <tag>` for tags), copy `src/` (only `parser.c`,
  `scanner.c`/`scanner.cc` if present, `grammar.json`, `node-types.json`,
  `tree_sitter/`), `tree-sitter.json` (or synthesise a minimal one naming
  the grammar), the licence file, and for the typescript fork also
  `common/scanner.h` placed where `scanner.c` includes it (check the
  `#include` path). Write `SOURCE` (repo, subdir, pin, date, licence).
  Fetch Zed's `highlights.scm` (+ `injections.scm` when present) per
  language into `vendor/zed-queries/<lang>/` with a `SOURCE`, and write
  `vendor/zed-queries/SOURCE.md` (table of language → URL → commit) and the
  licence text. Idempotent; prints what it did.
- `bin/build-grammars [--check]`: for each `vendor/grammars/<name>/`, if
  `lib/<name>.so` is missing or older than any file under `src/`, run
  `tree-sitter build -o lib/<name>.so <dir>` and print `grammar: built
  <name> (N s)`, else `grammar: unchanged <name>`. `--check` only reports and
  exits 1 if anything is missing. Requires `tree-sitter` and a C compiler;
  missing → clear message, exit 1. Quoted paths throughout (the checkout
  path has a space).
- `bin/install`: after the package check, run `bin/build-grammars` and
  surface its lines; a failure there is reported but does not fail the
  install (same policy as missing packages). Update the README package line
  to `quickshell wl-clipboard qt6-5compat tree-sitter-cli gcc nodejs` (drop
  the `tree-sitter-*` grammar packages: ADR-0002) and adjust
  `tests/install.test.mjs` only if an assertion hard-codes the old list.

### Fixtures and tests

- `tests/fixtures/code/`: `sample.js`, `sample.ts`, `sample.tsx`,
  `sample.py`, `sample.rs`, `sample.c`, `sample.sh` (with a shebang),
  `sample.json`, `sample.yml`, `sample.md`, `sample.rb`, `sample.lua`. Each
  10–30 lines, each containing at least: a keyword, a string, a comment, a
  function/definition name. A `sample.txt` (unknown) and a `unicode.js`
  (a string with `é` and an emoji before a keyword on the same line) for the
  byte-column conversion.
- `tests/language.test.mjs`: every suffix and filename in `LANGUAGES` maps
  to its id; shebang cases (`#!/usr/bin/env python3`, `#!/bin/bash`,
  `#!/usr/bin/env node`); `README` / `.txt` / `null` filename with no
  shebang → `null`; suffix wins over shebang; case-insensitive suffix.
- `tests/highlight-zed.test.mjs` (uses the gruvbox fixture theme from
  spec 0003 so expected colours are stable):
  - `before`: run `bin/build-grammars` once (idempotent; first run compiles).
  - `parseQueryOutput` on a canned snippet (including a `text:` field with a
    backtick and a multi-row range).
  - `spansFromCaptures` semantics on synthetic captures: exact-range first
    wins; inner overrides outer; adjacent same-style merge; coverage
    invariant; tabs and trailing spaces preserved; CRLF preserved; byte →
    char conversion with the unicode fixture.
  - For **every** fixture language: `highlight()` returns `lines.length ===
    text.split("\n").length`, the coverage invariant holds, and four
    specific tokens (the keyword, the string, the comment, the function
    name — named per fixture in the test) carry exactly
    `zedSyntaxStyle(theme.zed, <expected capture>).color`, e.g. `def` →
    `keyword`, `"hello"` → `string`, `# note` → `comment`, `greet` →
    `function`. Where a language's query maps a token to a different
    capture than expected (e.g. `function.definition`), assert the capture
    the query actually uses (find it by running the CLI once by hand) —
    the point is that the colour equals the theme's colour for that capture.
  - Unknown language → plain spans in the editor foreground; a missing `.so`
    (`root` pointed at an empty temp dir) → plain spans + warning, no throw.
  - Performance: `highlight()` on the 60-line `tests/fixtures/render`-style
    JS text (reuse the spike's 57-line `sample.js` copied into
    `tests/fixtures/code/perf.js`) completes in under 1000 ms (assert), and
    the test logs the measured time for the reviewer (target under 200 ms).
  - Theme independence: the same fixture under flexoki-light yields
    different colours for the keyword token.

### Side-by-side record

Open `tests/fixtures/code/sample.js` in Zed (`zed -n <file>` — a window
opens on the live desktop; close it afterwards with the Lua dispatcher
`hl.dsp.window.close`, as the spike learned), take a screenshot of the
editor region (`grim -g "$(hyprctl activewindow -j | jq -r '"\(.at[0]),\(.at[1]) \(.size[0])x\(.size[1])"')" <png>` if `grim` is present; else `omarchy-cmd-screenshot`-style tooling; record the command), and beside
it render the same file through `lib/input.mjs` + `bin/omasnap --fixture`
(build a fixture JSON from `highlight()` output — write a tiny script under
the spec dir). In `side-by-side.md`: both PNGs, then a table of five tokens
(keyword, string, comment, function name, punctuation) with the capture,
the theme colour, and a note on whether Zed's pixel colour matches (sample
the screenshot with `node` + a PNG decoder is overkill — use
`magick <png> -format '%[pixel:p{x,y}]' info:` if ImageMagick is installed,
else say "judged by eye" honestly). Zed's semantic (LSP) highlighting can
recolour identifiers after a moment; screenshot promptly after open, and
note any token where LSP colouring differs — that is out of scope by the
spec.

## Test strategy

- Gate `test`: `node --test tests/*.test.mjs` (76 existing + new). The
  first run compiles grammars (minutes); later runs are fast.
- Verify rule 3: `grep -rnE '#[0-9a-fA-F]{6}' app lib` → nothing. Rule 4:
  no Qt in `lib`. Rule 5: the only subprocesses are `tree-sitter` (fixed
  argv) and, at install, `tree-sitter build`; nothing on the run path
  fetches. Rule 8: selection text goes to a 0600 temp file and to nothing
  else; `execFileSync` without a shell; temp file removed in `finally`.
- Reviewer: runs `bin/build-grammars --check`, the suite, times
  `highlight()` on the 60-line fixture, reads `side-by-side.md`, spot-checks
  two tokens against `zed-theme.json`, and confirms `git ls-files vendor`
  contains sources, licences and `SOURCE` files but no `.so`.
- Deploy gate `bin/install` at ship compiles the grammars into the installed
  plugin (which is this checkout).

## Risks and unknowns

- **Compile time for tsx/typescript** (8.4 MB `parser.c` each) on this
  aarch64 laptop: measure; if a single grammar exceeds ~2 minutes, keep it
  but note it in README ("first install takes a few minutes").
- **Repository weight**: ~35 MB of vendored C. Accepted by ADR-0002; the
  builder reports the actual `du -sh vendor`.
- **Capture precedence**: tree-sitter-highlight's rule is the assumption;
  the side-by-side check is the test. Document whichever rule survives.
- **Zed extension queries drift**: the ruby/lua queries come from the
  extension repos' `main` (record the commit); they may be newer than the
  extension version installed in Keith's Zed. Acceptable; note it.
- **Markdown**: two grammars, inline needs injection to colour emphasis
  inside paragraphs; without injections headings, code fences and list
  markers still colour. Say so.
- **Scanner includes**: Zed's typescript fork's `scanner.c` includes
  `../../common/scanner.h`; keep the relative layout
  (`vendor/grammars/common/scanner.h` + `tsx/src/scanner.c`) or rewrite the
  include path in the vendored copy and note it in `SOURCE`.
- **`tree-sitter query` stderr warning** about parser directories: harmless;
  do not create `~/.config/tree-sitter/config.json`.
- **Dropbox sync** of a 35 MB commit: fine, but do the vendoring in the
  worktree (scratchpad) and let the squash-merge bring it over once.

## ADR

`docs/adr/0002-grammar-sourcing.md` (proposed with this plan; set to
`accepted` in the ship commit).
