# Findings — Spike: primary-selection input path and tree-sitter + Zed-queries highlight path

Date: 2026-09-05. Timebox: 2 hours (used in full). Zed **1.18.1**
(`bebe92f469834a287f5a57ed78e8d51a918b8ada`, matches tag `v1.18.1` exactly).
tree-sitter CLI **0.26.9** (pacman). Node 26.7.0.

Reproduce the highlight-path evidence with `scripts/highlight-path.sh` (no
desktop interaction, safe to re-run any time). Reproduce the input-path
evidence with `scripts/input-path.sh` (steals focus on the live desktop for
~15-20s; see the "Incident" note below before re-running it).

## Input path

### Q1 — Does `wl-paste --primary` return exactly the Zed selection, with nothing copied?

**Command:** `scripts/input-path.sh` (focuses a freshly opened Zed window on
`fixtures/sample.js`, sends Ctrl+A via `hl.dsp.send_key_state`, reads
`wl-paste --primary --no-newline`).

**Output** (`out/q1-zed-selectall.txt` vs `fixtures/sample.js`, run twice,
identical result both times):

```
$ cmp out/q1-zed-selectall.txt fixtures/sample.js
out/q1-zed-selectall.txt fixtures/sample.js differ: byte 1, line 1
$ tail -c +2 out/q1-zed-selectall.txt | cmp - fixtures/sample.js
(no output = identical)
$ cat out/q1-clipboard-check.txt
clipboard unchanged: sentinel intact
```

**Answer:** Yes, with one caveat that is an artifact of the test method, not
of Zed or `wl-paste`. `wl-paste --primary` returns exactly the selected text,
byte-for-byte including the file's own trailing newline (Zed does not add
one), and the clipboard sentinel was untouched (confirming Zed publishes the
selection to the *primary* selection only, not the clipboard). The caveat:
both runs show one extra literal space character (`0x20`) inserted at byte 0
of the buffer before the `Ctrl+A` capture — this reproduced on the *second*
run even after the script had already stopped sending a preceding `Escape`
(dropped after run 1 specifically because run 1 also showed this leading
space; see `scripts/input-path.sh`'s comment at the "focus zed, select all"
step), so the Escape keypress is not a sufficient explanation for the second
occurrence. Two candidate explanations, neither confirmed: (a)
`hl.dsp.send_key_state`'s synthetic key injection leaks a stray keystroke
into the focused surface on this machine (Hyprland's own docs for this
dispatcher warn synthetic key state can behave unpredictably — see the
omarchy `clipboard.lua` comment cited in plan.md); or (b), untested, `zed -n`
on the second run reused the already-running Zed server process from run 1
and reopened a *dirty* buffer left over from run 1's Ctrl+A-selected, then
mutated (by whatever produced the leaked character) state, rather than a
fresh read of the file from disk — `zed -n` opens a *new window*, not
necessarily a fresh read if the server already has that path open. Neither
was isolated within the timebox (would need e.g. a fully separate Zed
`--user-data-dir` per run, or checking for a `[+]`/dot dirty-buffer marker
via the window title before selecting). Once the one leaked character is
excluded, the rest of the 1404-byte fixture is identical both times. **VS
Code: not run** (not installed; see "Not verified").

**Confidence:** High for "does the primary selection carry Zed's selected
text, exactly, with nothing on the clipboard" (the actual question).
Medium-low on "is `send_key_state` a safe way to synthesize keystrokes" — it
is not, on this machine; irrelevant to the shipped product since Omasnap
never synthesizes keystrokes, only reads the primary selection passively,
but relevant to anyone else using this spike's scripts.

### Q2 — Does a Hyprland-keybinding-style `exec` still see the editor as active and its selection?

**Command:** with Zed focused and Ctrl+A already sent,
`hyprctl dispatch 'hl.dsp.exec_cmd("<spec>/scripts/probe.sh <out-dir>")'`,
where `probe.sh` writes `hyprctl activewindow -j` and
`wl-paste --primary --no-newline` to files.

**Output** (two runs):

```
run A: q2 active window class=org.quickshell address=0xaaab120a11c0 (title "Pacman")
       q2 primary selection bytes: 1405
run B: q2 active window class=gcr-prompter address=0xaaab121059e0
       q2 primary selection bytes: 1405
```

Both runs: `probe-primary.txt` held the exact 1405-byte Zed selection from
Q1 (leaked space included), matching what a real binding would need to read.

**Answer:** Partially verified, with a real and reproducible caveat.
`wl-paste --primary` inside the exec'd script correctly saw Zed's selection
both times — the selection survives the `exec` round-trip regardless of what
`hyprctl activewindow -j` reports. But `hyprctl activewindow -j`, read
immediately after the `exec_cmd` dispatch fired, reported an unrelated,
transient window both times (a quickshell overlay once, a GNOME
keyring/credential prompt the other time) instead of Zed. The simpler,
more likely explanation for at least the second occurrence: a freshly
launched Zed process can trigger a one-time GNOME Keyring "unlock"
prompt (`gcr-prompter`) as it starts up and touches the keyring for stored
credentials — that would transiently steal focus independent of anything
`exec_cmd` itself does, and lines up with `gcr-prompter` being exactly the
class observed. The quickshell/"Pacman" overlay on the first run is less
obviously explained the same way (it is a pre-existing window on this
desktop, not something Zed's launch would trigger) and could still be an
artifact of invoking `hl.dsp.exec_cmd` via an external `hyprctl dispatch`
call from this sandboxed environment. Neither explanation was isolated
within the timebox (would need e.g. repeating Q2 without freshly launching
Zed each time, to separate "Zed startup" from "exec_cmd itself" as the
trigger), and a *real* Hyprland keybinding defined with
`bind = ..., exec, ...` in the compositor's own config was not
independently tested either (it needs registering a temporary real bind,
which risks colliding with the user's live keymap). **The
selection-reading half of Q2 is answered (yes); the
active-window-identification half is not fully resolved** — a real
implementation should re-read `hyprctl activewindow -j` defensively (e.g.
retry once, or treat a non-editor class as "use the last known editor
window") rather than assume the first read is trustworthy.

**Confidence:** High for "the primary selection is still readable from an
exec'd script." Low-medium for "the active window is reliably Zed at the
moment the binding fires" — flagged as a real risk for spec 0006, not
resolved.

### Q3 — Window class and title format

**Command:** `hyprctl -j clients`, filtering for `class` matching `/zed/i`,
captured right after `zed -n <file>`.

**Output** (`out/q3-title-js.json`, `out/q3-title-py.json`, both runs
identical):

```
class:          dev.zed.Zed
initialClass:   dev.zed.Zed
title (sample.js -n window):  "sample.js — sample.js"
title (sample.py -n window):  "sample.py — sample.py"
initialTitle:   "sample.js" / "sample.py" (no " — " suffix at creation time)
```

**Answer:** `class` is exactly `dev.zed.Zed` (matches the plan's
expectation, confirmed rather than assumed). The title Zed reports for a
file opened standalone (no project folder) is `<filename> — <filename>`
(filename repeated: `<file> — <project-or-file>`, and with no project it is
the same string twice). A parseable regex for the filename:
`^([^—]+?) — ` (capture group 1, trim trailing whitespace) — works for both
observed titles. Note this differs from the plan's guess of `<file> —
<project>`; with an actual project folder open the second half would likely
be the project name instead, but that was not tested (no project fixture
opened within the timebox — mark as **not verified**, cheap to add later:
`zed -n <project-dir>/<file>`).

**Flag, not asserted, for spec 0006:** Zed (like most editors) is likely to
mark a buffer with unsaved changes in its title (commonly a leading dot or
bullet, e.g. `● sample.js — sample.js`) — this spike's fixtures were never
edited-and-unsaved when their titles were captured, so that marker was never
actually observed here, only inferred from common editor convention. The
proposed regex `^([^—]+?) — ` would still extract the filename correctly
even with a leading dirty-marker character (it anchors on `—`, not on the
start of the filename), but spec 0006 should verify this against a real
dirty buffer before relying on it, since Q1's own artifact (a stray
character appearing in a Zed buffer) shows buffer state on this machine is
not always as clean as assumed.

**Confidence:** High for the class string and the two-file title format
actually observed. Medium for the general regex, since the with-project case
was not tested, and the dirty-buffer marker claim above is unverified.

### Q4 — `wl-paste --primary` with nothing selected

**Command:** `wl-copy --primary --clear` then `wl-paste --primary
--no-newline`, and separately reading whatever the terminal (foot) currently
holds as its own primary selection (no explicit selection made anywhere).

**Output** (`out/q4-result.txt`, `out/q4b-result.txt`):

```
exit=1
stdout: []
stderr: [Nothing is copied]
```
identical for both the explicitly-cleared case and the terminal-owned
"nothing selected" case.

**Answer:** `wl-paste --primary` exits **1** and prints `Nothing is copied`
to stderr (nothing on stdout) when there is no primary selection anywhere on
the desktop. This is a clean, scriptable signal: `wl-paste --primary
--no-newline 2>/dev/null; [ $? -ne 0 ]` means "fall back to the clipboard,"
exactly as ADR-0001 describes.

**Confidence:** High.

### Edge case — does Zed publish a primary selection at all?

Not needed: Q1 already shows Zed does publish to the primary selection, so
the `wtype` + Ctrl+C clipboard-fallback alternative in the spec's edge cases
was not required.

## Highlight path

### Q5 — Can `tree-sitter highlight`/`query` run Zed's `highlights.scm` against a JS/Python grammar?

**Commands:**
```
tree-sitter query --lib-path grammars/lib/javascript.so --lang-name javascript -c zed-queries/javascript/highlights.scm fixtures/sample.js
tree-sitter query --lib-path grammars/lib/tsx.so --lang-name tsx -c zed-queries/javascript/highlights.scm fixtures/sample.js
tree-sitter query --lib-path grammars/lib/python.so --lang-name python -c zed-queries/python/highlights.scm fixtures/sample.py
```

**Output:**
```
$ tree-sitter query --lib-path grammars/lib/javascript.so --lang-name javascript -c zed-queries/javascript/highlights.scm fixtures/sample.js
Error: Query compilation failed
Caused by:
    Query error at 35:2. Invalid node type "nested_type_identifier"

$ tree-sitter query --lib-path grammars/lib/tsx.so --lang-name tsx -c zed-queries/javascript/highlights.scm fixtures/sample.js
(321 lines of capture output, exit 0 — see out/query-js.txt)

$ tree-sitter query --lib-path grammars/lib/python.so --lang-name python -c zed-queries/python/highlights.scm fixtures/sample.py
(414 lines of capture output, exit 0 — see out/query-py.txt)
```

**Answer, with the key discovery:** Zed does **not** highlight `.js` files
with the plain `tree-sitter-javascript` grammar. Its own
`crates/grammars/src/javascript/config.toml` sets `grammar = "tsx"` — Zed
parses JavaScript with the **TSX** grammar from Zed's own fork of
`tree-sitter-typescript` (the upstream project's GitHub repository under the
`zed-industries` org, `tree-sitter-typescript`), pinned in Zed's
`Cargo.lock` at `v1.18.1` to commit
`e2c53597d6a5d9cf7bbe8dccde576fe1e46c5899`. Zed's javascript
`highlights.scm` uses node types (e.g. `nested_type_identifier`) that only
exist in the TypeScript/TSX grammar, not in plain
`tree-sitter-javascript` — the query fails to even compile against it. Once
built against the correct `tsx` grammar (from Zed's pinned fork, shallow
cloned and built with `tree-sitter build`), the query compiles and produces
sensible captures. Python is simpler: Zed pins plain
`tree-sitter-python` `0.25.0` (crates.io, matches upstream GitHub tag
`v0.25.0` exactly) and its `highlights.scm` compiles and runs cleanly
against it with zero errors.

All predicates used by both query files (`#any-of?`, `#eq?`, `#match?`) are
standard tree-sitter predicates natively supported by the CLI — nothing
needed stripping.

**Config needed:** none of the `~/.config/tree-sitter/config.json`
machinery is actually required to *run* the queries — `tree-sitter query
--lib-path <so> --lang-name <name> <query> <file>` runs directly against a
prebuilt `.so`, with no config file, no `tree-sitter.json`, and no
`~/.config` writes. **`tree-sitter highlight` (as opposed to `tree-sitter
query`) was not made to work with Zed's queries within the timebox**, and an
earlier version of this document overstated that it was — correcting that
here. Two problems were hit and not resolved: (1) `tree-sitter highlight`
has no `--lib-path`/`--lang-name` option (only `tree-sitter query` does), so
it must go through `--grammar-path`/`--config-path` language discovery
instead; and (2) `tree-sitter highlight`'s `--query-paths` resolves relative
paths relative to the *grammar* directory, not the current working
directory or an absolute path passed on the command line — passing an
absolute path to Zed's `highlights.scm` got `--scope source.tsx
--query-paths <absolute path>` past that, but the resulting `--html` output
(`out/highlight-js-zed5.html`) contains no `<span>` elements at all (visible
by inspection — just plain `<td class=line>` cells), because `highlight`
only emits a span when a capture resolves against the config's `theme` map,
and this spike's `ts-config.json` (since removed; it was unused otherwise)
supplied only an empty `"theme": {}`. **The working, evidence-backed route
this spike's recommendation actually relies on is `tree-sitter query
--lib-path <so> --lang-name <name> -c <query> <file>`** (used throughout
Q5-Q7 above) — not `tree-sitter highlight`. Whether `tree-sitter highlight`
can be made to work with a populated `theme` map is unresolved and not
needed: `query`'s raw `(pattern, capture, byte-range, text)` output is
exactly the token-span interface the renderer needs, and Q6/Q7 already
verify it end to end.

**Pacman `.so` files without a grammar source directory (the plan's second
half of Q5):** confirmed the CLI *can* use a bare `.so` with no grammar
source directory at all — `tree-sitter query --lib-path
/usr/lib/tree_sitter/c.so --lang-name c <query> <file>` ran correctly with
no source dir present. What does **not** work is pointing the
config-file/`--scope` discovery mechanism (`parser-directories` +
`tree-sitter.json`) at a stub directory with only a `tree-sitter.json` and
no real grammar source — that path wants to build-and-hash-match a real
grammar source tree, so it can't "adopt" an arbitrary prebuilt `.so`
(tested: `Unknown scope 'source.c'` because the stub wasn't discovered, and
even once discovered by content it would try to rebuild from the missing
source). **Practical answer for spec 0005: always drive the CLI with
`--lib-path`/`--lang-name` (or `-p <source-dir>`) directly; never rely on
the config-file scope-discovery path for vendored grammars.**

**Confidence:** High. Reproducible via `scripts/highlight-path.sh`.

### Q6 — Do Zed's capture names map onto the theme's `syntax` keys?

**Command:** `node scripts/resolve-captures.mjs out/theme-syntax-keys.json
out/captures-js-declared.txt --fired out/query-js.txt` (and the Python
equivalent). Theme keys read live from
`~/.local/state/omarchy/current/theme/zed-theme.json`.

**Output** (`out/resolve-js.txt`, `out/resolve-py.txt`):

```
JS:  35 captures declared in highlights.scm; 20 exact, 14 resolved by
     Zed's dotted-prefix fallback (e.g. `keyword.import` -> `keyword`,
     `type.class` -> `type`), 1 unresolved (`text.jsx` — a JSX-only
     capture; fixture has no JSX).
     Of the 25 captures that actually fired on fixtures/sample.js: 18
     exact + 7 fallback = 25/25 resolved. Zero unresolved.

PY:  39 captures declared; 16 exact, 21 fallback, 2 unresolved
     (`_isinstance`, `_issubclass` — Zed's convention for
     predicate-only "private" captures used inside `#match?`/`#eq?`
     clauses, never intended to reach the renderer; not a real gap).
     Of the 31 captures that actually fired on fixtures/sample.py: 14
     exact + 17 fallback = 31/31 resolved. Zero unresolved.
```

**Answer:** Yes — every capture that Zed's own queries actually produce on
representative JS/Python source resolves to a theme `syntax` key, using
exact match or Zed's documented dotted-prefix fallback
(`a.b.c → a.b → a`). The only "unresolved" names are either JSX-specific
captures that never fire on non-JSX code, or Python's underscore-prefixed
private predicate captures that were never meant to be rendered. **No
renderer-blocking gap was found for the JS/Python subset this spike
covers.**

**Confidence:** High for the captures that fire on ordinary code (verified
against the actual fixtures). Medium for captures that never fired (JSX,
some Python decorator/type-call variants) — plausible by inspection but not
exercised against real source.

### Q7 — Is the CLI fast enough?

**Command:** `scripts/time-query.sh grammars/lib/tsx.so tsx
zed-queries/javascript/highlights.scm fixtures/sample.js` (10 runs, prebuilt
`.so`, full process start included); same for Python.

**Output:**
```
JS  (57-line fixture, tsx.so, 1.5 MB): 70-103 ms/run, median ~86 ms
PY  (58-line fixture, python.so):      38-66 ms/run,  median ~47 ms
```

**Answer:** Yes, comfortably under the ~200 ms threshold for both
languages, including process startup — no need for the Node
`tree-sitter`/`web-tree-sitter` binding. **The larger TSX grammar (1.5 MB
`.so`, since it embeds the whole TypeScript+JSX grammar) roughly doubles the
Python grammar's time but is still ~2x margin under budget.**

**Confidence:** High.

## Recommendations

**Input path: proceed as ADR-0001 says**, with one addition. `wl-paste
--primary` is exactly right for reading Zed's selection, publishes nothing
to the clipboard, and fails predictably (exit 1, "Nothing is copied") when
empty — the fallback-to-clipboard logic in spec 0006 can rely on that exit
code directly. Two implications for spec 0006: (1) the window class to
match is `dev.zed.Zed`, and the title-based filename regex is `^([^—]+?)
— ` (verify the project-open case cheaply before relying on the second
half); (2) **read `hyprctl activewindow -j` defensively** — this spike
twice observed transient, unrelated windows reported as active immediately
after firing an exec-style dispatch on this machine, though the primary
selection itself was unaffected both times. Spec 0006 should not assume the
first `activewindow` read is trustworthy without a sanity check (e.g. is the
class recognized as an editor?).

**Highlight path: proceed as ADR-0001 says, with a corrected grammar
choice.** tree-sitter + Zed's own `highlights.scm`, driven via
`--lib-path`/`--lang-name` against a vendored, prebuilt `.so`, is fast
enough and produces captures that map cleanly onto the live theme. The
correction: **spec 0005 must vendor Zed's fork of `tree-sitter-typescript`
(the `tsx` grammar) for JavaScript, not plain `tree-sitter-javascript`** —
matching exactly what Zed itself parses `.js` with. Pin to the same commit
Zed's `Cargo.lock` pins at the target Zed version
(`e2c53597d6a5d9cf7bbe8dccde576fe1e46c5899` for `v1.18.1`), the same way
this spike pinned `tree-sitter-python` to `v0.25.0`. Drive the CLI (or its
Node binding, if wrapped) with an explicit grammar path/library — never via
the config-file scope-discovery mechanism, which cannot adopt an arbitrary
prebuilt `.so`.

## ADR

**ADR-0001 is amended** (see `docs/adr/0001-quickshell-qml-per-editor-highlighting.md`,
`## Amended 2026-09-05`): the tree-sitter decision stands, but the specific
grammar backing Zed's `.js` highlighting is corrected from an assumed
`tree-sitter-javascript` to Zed's own `tree-sitter-typescript` fork's `tsx`
grammar. This is a vendoring/implementation detail, not a change to the
overall stack decision, but it is exactly the kind of thing spec 0005 would
otherwise get wrong on day one.

## Not verified (out of timebox or blocked)

- **VS Code**, both halves of Q1 and Q3: `code` is not installed (`sudo
  pacman -S code` needs sudo, not run). `scripts/input-path.sh` has a guarded
  VS Code branch stub (`command -v code`) that currently prints "not run";
  install VS Code and re-run the script to fill it in.
- **Q2's real-keybinding path**: only the `hl.dsp.exec_cmd(...)` simulation
  was tried; registering a genuine temporary Hyprland bind
  (`hyprctl keyword bind ... exec ...`, then triggering it, then
  `unbind`) was not attempted within the timebox. Worth doing once, briefly,
  before spec 0006 is built, to see whether the active-window artifact seen
  here is specific to the external-dispatch simulation.
- **Q1's partial-selection case** (select first N lines, not the whole
  file): skipped — the multi-modifier `send_key_state` chord syntax (e.g.
  Ctrl+Shift+Down) was not confirmed within the timebox. Full select-all is
  sufficient evidence that the primary-selection mechanism itself works;
  partial selection is very likely to behave the same way (it is the same
  Wayland primary-selection protocol, indifferent to how much text is
  selected) but that inference was not directly tested.
- **Q3's with-project-open and no-file-open title variants**: not tested;
  only the two standalone-file titles were captured.
- **The classic `hyprctl dispatch closewindow "address:..."` /
  `focuswindow "address:..."` / `sendshortcut` fallback forms** mentioned in
  plan.md: `send_key_state` and `exec_cmd` were only ever driven via the Lua
  `hl.dsp.*` form (per plan.md's guidance to try that first), so the classic
  form was never tried for those two specifically. It *was* tried for
  `closewindow` and `focuswindow`, and rejected outright both times by this
  Omarchy's Lua Hyprland config:

  ```
  $ hyprctl dispatch focuswindow "address:0xaaab11f6cd90"
  error: [string "return hl.dispatch(focuswindow address:0xaaab..."]:1: ')' expected near 'address'
   → Note: dispatch in lua is a shorthand for hl.dispatch(...), your syntax might need to be updated.
  exit=7

  $ hyprctl dispatch "hl.dsp.focus({ window = \"address:0xaaab11f6cd90\" })"
  ok
  exit=0
  ```

  (run as a no-op refocus of whatever window was already active at the
  time, to confirm the Lua form without disturbing anything). `closewindow`
  needed `hl.dsp.window.close({ window = "address:..." })` (see Incident
  below); `focuswindow` needed `hl.dsp.focus({ window = "address:..." })` —
  confirmed above and now used throughout `scripts/input-path.sh` (an
  earlier version of this script used the classic `focuswindow` form, which
  silently failed behind a masked exit code — see Incident below).

## Incident during Q1/Q2 live-desktop testing (full disclosure)

The first run of `scripts/input-path.sh` had two bugs, both now fixed in the
committed script:

1. **Cleanup's `hyprctl dispatch closewindow "address:$addr"` silently
   failed** (this Omarchy's Lua Hyprland config rejects the classic
   dispatcher grammar). The two Zed windows the script opened were left
   running after the first run. Caught immediately after the run by
   checking `hyprctl -j clients`; closed manually with
   `hyprctl dispatch 'hl.dsp.window.close({ window = "address:<addr>" })'`,
   confirmed gone. The script's cleanup function now uses that same Lua
   form.
2. **The clipboard save/restore used a bash variable**
   (`CLIP_BEFORE=$(wl-paste ...)`), which is not binary-safe: bash's `$(...)`
   strips embedded NUL bytes and trailing newlines. The second run of the
   script happened to occur while the live desktop's clipboard held a large
   binary payload (a PNG, 445-465 KB, `application/octet-stream` — almost
   certainly something the user or another process copied between the two
   runs, unrelated to this spike). The variable-based restore is very
   unlikely to have reproduced that PNG byte-for-byte (compressed PNG data
   routinely contains `0x00` bytes). **This may have altered clipboard
   content that predates this spike and was not put there by it.** The
   script has been fixed to save/restore via a file
   (`out/clip-before.bin`) instead of a variable; a standalone round-trip
   test after the fix (`wl-paste > file; wl-copy < file; wl-paste > file2;
   cmp`) confirmed byte-for-byte fidelity (464864 bytes, identical) for
   whatever is currently on the clipboard, but the fix was not re-exercised
   through a full third live-desktop run within the timebox (to minimize
   further disruption) — **the original pre-spike clipboard content, if it
   mattered, cannot be recovered from here and should be re-copied by
   whoever needs it.**
3. **Caught in review, not by this spike:** every `hyprctl dispatch
   focuswindow "address:$X"` call (the initial focus onto Zed, the
   re-focus before Q2, and the cleanup's refocus of whatever was active
   before the script ran) used the same classic dispatcher grammar that
   `closewindow` was already known (from bug 1) to fail on this Omarchy's
   Lua Hyprland config — and every call was followed by `>/dev/null 2>&1 ||
   true`, which swallowed the `')' expected near 'address'` / exit 7 error
   completely. The cleanup step still logged `"refocused previous window
   $PREV_ADDRESS"` unconditionally, regardless of whether the dispatch
   actually did anything — so the two runs described above did **not**
   reliably refocus the previous window via that log line's claim, even
   though the desktop was independently confirmed clean by other means
   (direct `hyprctl activewindow -j` inspection after each run, not by
   trusting the script's own log). Fixed: all three call sites now use
   `hl.dsp.focus({ window = "address:..." })` (confirmed working, see the
   "Not verified" section above for the exact evidence), and the cleanup no
   longer masks the exit code — it logs the dispatch's exit status and
   output on every run, so a future failure would be visible in the log
   rather than silently claimed as success.

Both issues from the original two runs, and the focus-dispatcher bug caught
in review, are now fixed in the committed `scripts/input-path.sh`. The
desktop was left clean after the second run: no stray Zed windows or
processes, `hyprctl activewindow` back to a `foot` window, primary selection
cleared, clipboard restored (see caveat above) — all confirmed by direct
`hyprctl`/`wl-paste` inspection after the run completed, not by the script's
own (at-the-time-inaccurate) log claim. The fixed focus dispatcher itself
was verified as a standalone no-op (see above) rather than by a third full
live-desktop run, per instruction to avoid further live-desktop runs.
