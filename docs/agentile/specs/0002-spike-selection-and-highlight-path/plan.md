# Plan — Spike: primary-selection input path and tree-sitter + Zed-queries highlight path

Written by the plan stage. A spike ships **findings, not code**: everything
produced lives under this spec directory. Timebox: 2 hours of builder time.
When the timebox is hit, write up what is known, mark the rest "not reached",
and stop.

## Files to touch

| File | Why |
|---|---|
| `<spec>/findings.md` | The deliverable: one section per question (1–7), each with the exact command, its output (trimmed to the relevant lines), the answer, and a confidence note. Ends with a recommendation per path. |
| `<spec>/scripts/input-path.sh` | Reproducible driver for questions 1–4 (launch Zed on a fixture, select, read the primary selection, capture `hyprctl activewindow -j`, clean up). Re-runnable once VS Code is installed. |
| `<spec>/scripts/highlight-path.sh` | Reproducible driver for questions 5–7 (fetch Zed queries, build grammars, run `tree-sitter highlight` / `tree-sitter query`, time it, diff capture names against the theme). |
| `<spec>/fixtures/sample.js`, `<spec>/fixtures/sample.py` | 60-line fixtures with a spread of syntax (comments, strings, template/f-strings, regex, numbers, classes, decorators, keywords, punctuation, builtins). |
| `<spec>/zed-queries/javascript/highlights.scm`, `<spec>/zed-queries/python/highlights.scm` | Vendored copies of Zed's queries as evidence, with a `SOURCE` file recording the URL, the Zed tag/commit, and the fetch date. |
| `<spec>/.gitignore` | `grammars/`, `node_modules/`, `*.so`, `out/` — cloned grammar repos and build outputs are throwaway and must not be committed. |
| `docs/adr/0001-*.md` | Only if an answer changes the stack: append an "Amended <date>" section, status stays `accepted`. |

Nothing under `lib/`, `app/`, `bin/` or `tests/` changes.

## Environment facts (verified at plan time, 2026-09-05)

- Zed **1.18.1** is installed at `~/.local/zed.app` (not pacman); `zed` is on
  PATH via `~/.local/bin/zed`. **VS Code is not installed** and installing it
  needs sudo, which an unattended loop cannot supply. Record
  `sudo pacman -S code` as the unrun step and mark the VS Code halves of
  questions 1 and 3 "not verified — re-run scripts/input-path.sh after
  install". Do not attempt sudo.
- tree-sitter CLI **0.26.9** (pacman). Installed pacman grammar packages:
  `tree-sitter-c`, `-lua`, `-markdown`, `-query`, `-vim`, `-vimdoc`. Their
  shared objects are in `/usr/lib/tree_sitter/<lang>.so`; there are no grammar
  source directories (`tree-sitter.json`, `grammar.js`) on disk. **JavaScript
  and Python grammar packages are not installed** (sudo needed) — build them
  from a shallow clone instead (see Q5) and note the pacman command.
- Zed's queries now live at
  `crates/grammars/src/<lang>/highlights.scm` in the zed repo (the
  `crates/languages/src/<lang>/` path in the spec is stale — record this).
  Prefer the tag matching the installed Zed (`v1.18.1`); fall back to `main`
  and record which. Raw URL:
  `https://raw.githubusercontent.com/zed-industries/zed/<ref>/crates/grammars/src/<lang>/highlights.scm`.
  Network is reachable for GitHub (`curl` and `git ls-remote` both worked).
- `gcc`, `clang`, `git`, `curl`, `jq`, `node` 26 are available. `wtype` is
  installed; Omarchy's own `clipboard.lua` documents that a virtual keyboard
  merges with physically held modifiers, so prefer Hyprland's send-shortcut
  dispatcher.
- This Omarchy's `hyprctl dispatch` accepts Lua dispatcher expressions. The
  send-shortcut form, from `~/.local/share/omarchy/bin/omarchy-menu-keybindings`
  (`dispatch_sendshortcut_binding`) and
  `~/.local/share/omarchy/default/hypr/bindings/clipboard.lua`:

  ```bash
  hyprctl dispatch 'hl.dsp.send_key_state({ mods = "CTRL", key = "A", state = "down", window = "class:dev.zed.Zed" })'
  sleep 0.05
  hyprctl dispatch 'hl.dsp.send_key_state({ mods = "CTRL", key = "A", state = "up",   window = "class:dev.zed.Zed" })'
  ```

  The classic `hyprctl dispatch sendshortcut "CTRL,A,class:dev.zed.Zed"` and
  `hyprctl dispatch focuswindow class:dev.zed.Zed` are the fallbacks the same
  script uses; try the Lua form first and record which worked. The Zed window
  class is expected to be `dev.zed.Zed` — confirm from `hyprctl -j clients`,
  do not assume.
- Theme `syntax` keys in the live `zed-theme.json` (for Q6):
  `attribute boolean comment comment.doc constant constructor embedded emphasis
  emphasis.strong enum function hint keyword label link_text link_uri number
  operator predictive preproc primary property punctuation punctuation.bracket
  punctuation.delimiter punctuation.list_marker punctuation.special string
  string.escape string.regex string.special string.special.symbol tag
  text.literal title type variable variable.special variant`.

## Approach

### Input path (questions 1–4) — `scripts/input-path.sh`

The live desktop is in use. Steal focus for as short a time as possible,
restore it, and leave nothing behind.

1. **Save state.** `prev=$(hyprctl activewindow -j | jq -r .address)`;
   `clip_before=$(wl-paste --no-newline 2>/dev/null || true)`. Set the
   clipboard to a sentinel: `wl-copy 'OMASNAP-SENTINEL'` so "nothing copied"
   is provable. Clear the primary selection: `wl-copy --primary --clear`.
2. **Q4 first (nothing selected).** `wl-paste --primary --no-newline; echo
   "exit=$?"` and capture stderr. Record exit code and message. Also record
   what `wl-paste --primary` returns when the *terminal* owns the primary
   selection (that is the state the user is in when nothing is selected in
   the editor) — this matters for the "fallback to clipboard" logic in spec
   0006.
3. **Launch Zed** on the fixture: `zed -n "<spec>/fixtures/sample.js" &` (the
   `-n` flag opens a new window; check `zed --help` and record the flag).
   Poll `hyprctl -j clients` (up to 15 s) for a client whose class contains
   `zed` (case-insensitive). Record the exact `class`, `initialClass`,
   `title`, `initialTitle`. If Zed shows a first-run/onboarding pane, note it
   and press Escape via send_key_state.
4. **Focus and select.** Focus the window (`hyprctl dispatch focuswindow
   class:<class>` or the Lua form). Send Ctrl+A. Wait 200 ms. Read
   `wl-paste --primary --no-newline > out/primary-js.txt`; `cmp` it with the
   fixture (Zed may or may not include the trailing newline — record).
   Confirm `wl-paste --no-newline` still returns the sentinel (**nothing was
   copied**). Then test a partial selection: Ctrl+Home, then Shift+Down three
   times; expect the first three lines. This is Q1 for Zed.
5. **Q2 — the binding path.** A Hyprland binding runs its command through the
   `exec` dispatcher. Reproduce that exactly while Zed is focused:
   `hyprctl dispatch 'hl.dsp.exec_cmd("<spec>/scripts/probe.sh <out-dir>")'`
   (fallback `hyprctl dispatch exec "<probe>"`), where `probe.sh` writes
   `hyprctl activewindow -j` and `wl-paste --primary` to files. Compare the
   active window address with Zed's and the selection with step 4. If the
   Lua exec form is rejected, also try registering a real temporary bind
   (`hyprctl keyword bind SUPER ALT SHIFT CTRL, F12, exec, <probe>` then
   send that chord with send_key_state, then `hyprctl keyword unbind ...`) and
   record whether the Lua config layer allows it. One working route is
   enough; record what was tried.
6. **Q3 — titles.** Repeat step 3 for `sample.py` (open it in the same
   window with `zed <file>` or a second `-n` window). Record both titles
   verbatim and propose the regex that extracts the filename (e.g.
   `^(.+?) — ` or whatever the real format is; Zed's default title is
   usually `<file> — <project>`), plus what the title is with an unsaved
   buffer and with no file open, if cheap.
7. **VS Code**: not installed; write the VS Code branch of the script (class
   guess `code` / `Code`, same steps) guarded by `command -v code`, and record
   "not run".
8. **Clean up, always** (trap EXIT): close the Zed windows this script opened
   (`hyprctl dispatch closewindow address:<addr>` for each address recorded,
   or kill the `zed` PID started by the script — never other Zed windows),
   `wl-copy --primary --clear`, restore the clipboard from `clip_before`
   (`printf %s "$clip_before" | wl-copy`, or `wl-copy --clear` if it was
   empty), and refocus `prev` (`hyprctl dispatch focuswindow address:$prev`).
9. **Edge case from the spec**: only if Zed does *not* publish a primary
   selection, test send_key_state Ctrl+C then `wl-paste`, and show the
   clipboard restore step. Otherwise write "not needed" with the evidence.

### Highlight path (questions 5–7) — `scripts/highlight-path.sh`

1. **Fetch Zed's queries** for javascript and python at tag `v1.18.1` (fall
   back to `main`); save under `zed-queries/<lang>/highlights.scm` plus
   `SOURCE`. Also fetch Zed's `injections.scm` only if `highlights.scm`
   references something that needs it (it should not).
2. **Grammars.** Shallow-clone `https://github.com/tree-sitter/tree-sitter-javascript`
   and `tree-sitter-python` into `<spec>/grammars/` (gitignored). Build with
   the CLI: `tree-sitter build --output <spec>/grammars/lib/javascript.so
   <spec>/grammars/tree-sitter-javascript` (check `tree-sitter build --help`
   for the 0.26 flags). Record the versions (`git -C … describe --tags`).
3. **Config.** Write `<spec>/ts-config.json` with
   `"parser-directories": ["<spec>/grammars"]` and a `theme` that is
   irrelevant (the CLI wants one; do not put colours anywhere else), and use
   `--config-path <spec>/ts-config.json` on every CLI call so nothing under
   `~/.config/tree-sitter` is created or changed. Record the minimal config
   that works. Then answer the pacman half of Q5 honestly: can the CLI use
   `/usr/lib/tree_sitter/c.so` without a grammar source directory? Try
   symlinking it to `~/.cache/tree-sitter/lib/c.so` (record and remove
   afterwards) and running `tree-sitter highlight` on a `.c` file with a
   minimal `tree-sitter-c` stub directory containing only `tree-sitter.json`
   and `queries/`; if that fails, the answer is "the CLI needs grammar source
   dirs; pacman's `.so` files are only usable through a binding that dlopens
   them" — which is a stack-relevant finding for spec 0005.
4. **Q5 — run Zed's queries.** For each language:
   `tree-sitter highlight --config-path … --query-paths zed-queries/<lang>
   fixtures/sample.<ext>` (check whether `--query-paths` wants the directory
   or the file). Capture stdout/stderr. The CLI validates capture names
   against `highlight-names`; if it complains about unknown captures (Zed
   uses names like `variable.special`, `punctuation.bracket`,
   `string.special.symbol`, `function.method`, `property`, `constructor`),
   pass a `--captures-path` file listing every capture in the .scm
   (`grep -ohE '@[A-Za-z_.]+' highlights.scm | sort -u | tr -d @`). If a
   predicate is unsupported (`#not-match?`, `#any-of?`, `#is?`, `#set!`,
   `#eq?` variants), the CLI names it; record each and test with the
   offending pattern stripped, stating whether stripping changes what the
   fixture highlights. Also run `tree-sitter query --config-path … <scm>
   fixture` — its output (pattern index, capture name, byte range, text) is
   the raw material for the token-span interface; save a sample to
   `out/query-js.txt` and put ten lines in findings.
5. **Q6 — capture-to-theme mapping.** With node, list every capture in each
   .scm, resolve each against the theme's `syntax` keys using Zed's fallback
   (`a.b.c` → `a.b` → `a`), and print three lists: exact matches, resolved by
   fallback (with the key used), and unresolved. Then, separately, list the
   captures that actually fire on the two fixtures (from the `query` output)
   and how each resolves — that is what the renderer will really need.
6. **Q7 — speed.** `tree-sitter highlight -t` on each 60-line fixture, plus
   ten timed runs in a loop (`date +%s%N` deltas) to give median wall time
   including process start. Threshold: under ~200 ms means the CLI is fine.
   If it is over, or if the CLI cannot express what the renderer needs, try
   `web-tree-sitter` WASM: `npm install --prefix <spec>/node --no-save
   web-tree-sitter tree-sitter-javascript` into a gitignored dir (spike-only;
   this is not a runtime install), load the wasm from the package, and time a
   parse+query. Record install size and whether the package ships a `.wasm`.
   Also note whether `tree-sitter build --wasm` works with the installed
   CLI (needs emscripten or docker; likely not — record).

### findings.md

Structure: a short header (date, timebox used, Zed/CLI versions), then
`## Q1` … `## Q7`, each with **Command**, **Output** (fenced, trimmed),
**Answer**, **Confidence**. Then `## Recommendations`: one paragraph per path
saying "proceed as ADR-0001" or the concrete alternative, with the
implications for specs 0005 and 0006 spelled out (class string, title regex,
grammar sourcing, engine choice). Then `## Not verified` (VS Code, anything
outside the timebox) with the exact command to finish each.

### ADR

If, and only if, an answer changes the stack (for example: Zed does not
publish a primary selection; or the CLI cannot be driven by Zed's queries and
a binding is required), append to `docs/adr/0001-*.md` a section
`## Amended 2026-09-05` describing the change, keep `status: accepted`, and
reference this spec. Otherwise write "ADR-0001 stands" in the findings.

## Test strategy

- No gate changes: `node --test tests/*.test.mjs` must still pass (nothing
  outside the spec directory changes).
- The evidence *is* the test: each of the seven answers cites a command that
  the reviewer can re-run, and the two scripts run end to end without manual
  steps (VS Code branch skipped when `code` is absent).
- The reviewer re-runs `scripts/highlight-path.sh` (cheap, no desktop
  interaction) and spot-checks `scripts/input-path.sh`'s outputs in `out/`
  against the findings; the reviewer may re-run the input script if the
  desktop is free.

## Risks and unknowns

- **Focus stealing on a live desktop.** Keep the Zed window open for seconds,
  not minutes; restore the previously focused window; never touch other
  windows' selections or the user's clipboard beyond the sentinel/restore
  dance described above.
- **Zed first-run UI** (onboarding, telemetry prompt, "trust this folder")
  may intercept Ctrl+A; handle with Escape and note it.
- **Hyprland send-shortcut quirks**: keys can stick (Omarchy splits down/up
  for that reason); always send the `up` state, and send a bare Escape at the
  end.
- **The Lua dispatcher syntax** may differ from the menu script's; the
  classic forms are the fallback, and the findings must say which worked.
- **Grammar/query version skew**: Zed's `v1.18.1` queries were written for
  the grammar versions pinned in Zed's `Cargo.lock`; a newer grammar from
  GitHub master can rename nodes and make a pattern fail to compile. If a
  pattern errors, check out the grammar at the commit Zed pins (search
  Zed's `Cargo.toml`/`Cargo.lock` for `tree-sitter-javascript`) and record
  the pin — that pin is what spec 0005 must vendor.
- **Timebox**: 2 hours. Order of work is Q4, Q1, Q3, Q2 (desktop, ~30 min),
  then Q5, Q6, Q7. Partial answers with evidence beat complete answers
  without.
- **Nothing here is production code.** The scripts may be quick and dirty;
  they must be reproducible and must clean up after themselves.

## ADR

none unless a finding forces an amendment to ADR-0001 (see above).
