# Plan — Preview and capture: the binding snaps the selection, previews it, copies or saves the PNG

Written by the plan stage. The build stage follows what it says. This
spec wires the shipped pieces (theme reader 0003, frame renderer 0004, Zed
highlighter 0005) into the brief's first outcome. Everything new is glue:
`bin/omasnap` live mode, `lib/snap.mjs`, `app/Preview.qml`, and the mode
switch in `app/Main.qml`.

## Binding note

The spec text says `SUPER + ALT + S`. That chord is Omarchy's default
"Move window to scratchpad" (found and fixed in spec 0001); the printed
binding and README already use **`SUPER + ALT + SHIFT + S`**, and an inbox
stub records that the spec wording should follow. Keep the SHIFT chord.

## Files to touch

| File | Why |
|---|---|
| `bin/omasnap` | Live mode (no flags): read the selection, the active window, run `lib/snap.mjs`, replace any running preview, start the preview; `--benchmark`; keeps `--fixture` mode. |
| `lib/snap.mjs` | `detectEditor`, `filenameFromTitle`, `prepareSnap`, `MAX_LINES`; CLI entry that writes the render input JSON and a request JSON. |
| `lib/editors.mjs` | Add `resolveFontFamily(family, { fcMatch })` — the editor's font may not be installed (FiraCode Nerd Font is not on this machine; Qt would substitute Liberation Sans, a proportional font). |
| `app/Main.qml` | Third mode: `OMASNAP_MODE=preview` loads `Preview.qml`. Render and placeholder modes unchanged. |
| `app/Preview.qml` | The floating preview window: scaled frame, Copy / Save / Close buttons, language selector, warning line; keys Enter / S / Esc; copy and save actions; test hook `OMASNAP_AUTO`. |
| `tests/snap.test.mjs`, `tests/editors.test.mjs` (extend) | Behaviour tests (below). |
| `README.md` | Usage section: the binding, what the preview does, where files go. |
| `bin/install` | Already prints the binding and window rule; only touch if wording needs the new flow. |

## Environment facts (verified at plan time, 2026-09-06)

- Tools on this machine: `wl-paste`, `wl-copy` (`--type mime/type`),
  `notify-send`, `xdg-user-dir` (`PICTURES` → `/home/keith/Pictures`),
  `hyprctl`, `jq`, `grim`. All are Omarchy defaults.
- Spike 0002 recorded: Zed's window class is **`dev.zed.Zed`**; a
  standalone file's title is `sample.js — sample.js` (em dash, U+2014),
  `initialTitle` is the bare filename; the project-open form is expected to
  be `<file> — <project>`; a dirty buffer may add a marker (untested).
  `hyprctl activewindow -j` fields: `class`, `initialClass`, `title`,
  `initialTitle`, `address`, `pid`. The spike also saw a transient window
  (a keyring prompt) reported as active right after an exec dispatch — read
  defensively (below).
- `qs` subcommands: `list`, `kill` (instance selection by `-i id` and the
  config-selection group, i.e. `-p <path>`), `ipc`. Use `qs kill -p
  "$ROOT/app/Main.qml"` to replace a running preview; if that flag form is
  rejected, fall back to `qs list` + `-i`. Verify at build time.
- Quickshell `Process` (`Quickshell.Io`): `command: [...]`, `running`,
  `stdinEnabled`, `write()`, `stdout: StdioCollector { onStreamFinished:
  … text }`, `onExited(exitCode, exitStatus)`, `startDetached()`. `FileView`
  reloads with `reload()`.
- `fc-match -f '%{family}' "FiraCode Nerd Font"` → `Liberation Sans`
  (substitution); `… "JetBrainsMono Nerd Font"` → `JetBrainsMono Nerd
  Font,JetBrainsMono NF`. So "is the family installed" = the first family
  returned equals the requested one (case-insensitive, trimmed).
- `lib/input.mjs` `buildInput({ snap, theme, wallpaperOverride })` accepts
  spans with explicit `color` (the highlighter's output) and resolves the
  theme; `lib/highlight/zed.mjs` `highlight({ text, language, theme })`
  returns `{ lines, warnings }`; `lib/language.mjs` `detectLanguage({
  filename, text })` and `LANGUAGES` (ids for the selector).
- `app/Main.qml` render mode already: reads `OMASNAP_INPUT` with a
  `FileView`, shows `Snap`, grabs at `exportScale` corrected for the
  Hyprland monitor scale, saves, quits. Reuse that grab code in the preview
  (factor it into a function on `Snap` or a small `Grab.js`, do not
  duplicate the scale arithmetic).

## Approach

### `bin/omasnap` live mode

Order of operations (no selection text ever in a shell variable or argv;
it flows `wl-paste` → file → Node → JSON → QML):

1. `RUNTIME="${XDG_RUNTIME_DIR:-/tmp}/omasnap"`, `mkdir -p -m 700`. Per-run
   files: `selection-$$.txt`, `window-$$.json`, `request-$$.json`,
   `input-$$.json`, `preview-$$.png`; all removed by an EXIT trap (the
   script does **not** `exec qs`; it waits for `qs` and then cleans up).
2. `wl-paste --primary --no-newline > selection` (exit 1 "Nothing is
   copied" is expected; ignore its status); if the file is empty,
   `wl-paste --no-newline > selection`; if still empty → `notify-send
   "Omasnap" "Nothing selected"` and exit 0.
3. `hyprctl activewindow -j > window` if `hyprctl` exists and succeeds,
   else write `{}`.
4. `node "$ROOT/lib/snap.mjs" --selection selection --window window
   --request request --out input` (plus `--language X` when given on the
   command line for testing). Exit codes: 0 ok; 3 = empty/whitespace-only
   selection (script notifies and exits 0); other → notify "Omasnap failed
   (see terminal)" and exit 1. `--benchmark`: run steps 2–4 with timing
   lines to stdout (`selection: N ms`, `window: N ms`, `prepare: N ms`,
   `total: N ms`) and exit without a window.
5. Replace any running preview: `qs kill -p "$ROOT/app/Main.qml" >/dev/null
   2>&1 || true` (only kills instances of *this* config).
6. `OMASNAP_MODE=preview OMASNAP_INPUT=input OMASNAP_REQUEST=request
   OMASNAP_ROOT="$ROOT" qs -p "$ROOT/app/Main.qml"`; then the trap cleans
   up. Grammar hint as today when `bin/build-grammars --check` fails.

### `lib/snap.mjs`

```js
export const MAX_LINES = 200;
export const EDITOR_CLASSES = { zed: ["dev.zed.Zed", "dev.zed.Zed-Dev", "dev.zed.Zed-Preview"], vscode: ["code", "Code", "code-url-handler", "code-oss", "Code - OSS", "codium", "VSCodium", "cursor", "Cursor"] };
export function detectEditor(windowClass) → "zed" | "vscode" | "other"
export function filenameFromTitle(title, editor) → string | null
export function prepareSnap({ text, windowClass, title, language, theme, root, highlightFn, fontFn }) → { snap, warnings, detected: { editor, language, filename } }
```

- `filenameFromTitle`: strip a leading dirty marker (`● `, `• `, `* `,
  `◌ `) and surrounding whitespace; Zed: `^(.+?) — ` (em dash) → group 1,
  else the whole title if it contains a dot and no spaces; VS Code:
  `^(.+?) - ` (hyphen) → group 1; other: `null`. Return `null` when the
  result is empty or contains `/` path separators only. Keep a table of
  the recorded title samples in the module comment.
- Defensive window read: if `windowClass` is not an editor class **and**
  the title is empty or the class matches known transient classes
  (`gcr-prompter`, `quickshell`, `omarchy-shell`, `hyprlock`), treat as
  "other" with `filename: null` (do not attempt title parsing).
- `prepareSnap`: split lines; if more than `MAX_LINES`, truncate and push
  the warning `"snapping first 200 lines"`; `language` = the override or
  `detectLanguage({ filename, text })`; `lines` = `highlight({ text,
  language, theme, root })` (spans already carry colours; when `language`
  is null the highlighter returns plain spans); `font` = `readEditorFont(
  editor === "other" ? "zed" : editor)` then `family =
  resolveFontFamily(family)`; `filename` shown in the title bar = the
  extracted filename, else the language id (spec: "the title bar shows
  the language"), else `"snippet"`. Return `snap = { filename, language,
  editor, font, lines }` matching `validateFixture`'s shape (spans with
  explicit colours). Warnings from the highlighter are appended.
- CLI (`--selection F --window F --request F --out F [--language X]`):
  reads the files (selection as UTF-8; if it contains a NUL byte, treat
  as binary: replace NULs and warn "selection contains binary data"),
  `readTheme()`, `prepareSnap`, `buildInput({ snap, theme })` with
  `warnings` and `languages: Object.keys(LANGUAGES)` and `detected` added
  to the JSON, writes `--out`; writes `--request` with `{ selection,
  window, root, pictures: <xdg-user-dir PICTURES via execFileSync, fallback
  ~/Pictures>, language }` so the preview can re-highlight and save.
  Exit 3 when the selection is empty/whitespace only. When invoked with
  `--request R --language X --out F` (re-highlight), re-read the selection
  and window from the request, rebuild with the override. No hex
  literals; no shell; `execFileSync` only for `xdg-user-dir`.

### `lib/editors.mjs` addition

`resolveFontFamily(family, { fcMatch } = {})`: run `fc-match -f '%{family}'
"<family>"` (fixed argv), take the first comma-separated family; if it
equals `family` case-insensitively → `family`, else → the system monospace
(`fc-match monospace` via the existing helper) and a `substituted: true`
flag (return `{ family, substituted }`). Never throws.

### `app/Main.qml`

`readonly property string mode: Quickshell.env("OMASNAP_MODE") || ""`.
Loaders: `mode === "preview"` → `Preview.qml`; else `outPath !== ""` →
render mode; else placeholder. Move the grab-at-2× logic into a reusable
place (`app/Grab.js` with `function exportSize(item, scale, screenScale)`,
or a function on `Snap`) used by both render mode and the preview.

### `app/Preview.qml`

`FloatingWindow { title: "Omasnap" }` sized to fit the screen:
`implicitWidth = min(snap.width * fit + 2 * margin, screen.width * 0.8)`
etc., where `fit = min(1, (screen.width * 0.8 - 2*margin) / snap.width,
(screen.height * 0.8 - bar - 2*margin) / snap.height)`. Colours only from
`input.theme.colors` (`background` for the window, `lighter_background` for
the bar and buttons, `accent` for the focused/primary button, `foreground`
/ `muted` for text, `red`/`yellow` for the warning line). All sizes as
named constants at the top (`barHeight`, `margin`, `buttonRadius`,
`buttonPadding`, `fitFraction: 0.8`).

Layout: a `Rectangle` window background; a container `Item` holding
`Snap { input }` with `scale: fit`, `transformOrigin: Item.TopLeft`; below,
a bar: `[ language selector ]  [warning text]        [Copy ⏎] [Save S] [Close Esc]`.

- **Buttons**: `Rectangle` + `Text` + `MouseArea`; hover uses
  `theme.colors.selection`. No Controls import (theme styling is simpler
  and Quickshell ships no Controls style config).
- **Language selector**: a button showing the current language id (or
  "plain"); clicking opens a popup `Rectangle` with a `ListView` of
  `input.languages` (+ "plain" = null) in theme colours; picking one runs
  `Process { command: ["node", root + "/lib/snap.mjs", "--request",
  requestPath, "--language", lang, "--out", inputPath] }` and on exit 0
  calls `inputFile.reload()`; the `FileView`'s `onLoaded` re-parses and
  re-assigns `snap.input`. Show a small "…" while running. Keys ← → cycle
  languages as a convenience (optional).
- **Copy (Enter)**: `snap.grabToImage(r => { r.saveToFile(previewPng);
  copyProc.running = true }, exportSize)` where `copyProc.command =
  ["sh", "-c", 'exec wl-copy --type image/png < "$1"', "omasnap",
  previewPng]` (the only shell use, and it sees only our own PNG path);
  on exit 0 → `notify-send "Omasnap" "Copied to clipboard"`; non-zero or
  `wl-copy` missing → `notify-send "Omasnap" "Copy failed: install
  wl-clipboard (sudo pacman -S wl-clipboard)"`. Window stays open.
- **Save (S)**: path `pictures + "/omasnap-" + yyyy-MM-dd_HH-mm-ss + ".png"`
  (`Qt.formatDateTime(new Date(), "yyyy-MM-dd_HH-mm-ss")`); `mkdir -p`
  is done by `bin/omasnap` before launch (it creates the Pictures dir if
  missing) so QML only saves; on success → `notify-send "Omasnap" "Saved
  <path>"`; failure → notify "Save failed". Window stays open.
- **Close (Esc)** → `Qt.quit()`. Closing the window quits (`onClosed`).
- **Warning line**: `input.warnings.join(" · ")` in `theme.colors.yellow`
  when non-empty.
- **Test hook** `OMASNAP_AUTO=copy|save|none`: after `snap.ready`, perform
  the action once, wait for the notify process to finish, then quit
  (mirrors Pacman's `PACMAN_DEBUG_KEYS`). This lets the builder and
  reviewer exercise copy and save without a human, even with the display
  locked (grabs render offscreen).

### Tests

`tests/snap.test.mjs`:

- `detectEditor`: every class in `EDITOR_CLASSES` maps correctly; `foot`,
  `""`, `undefined` → `other`.
- `filenameFromTitle`: `"sample.js — sample.js"` → `sample.js`;
  `"sample.js — omasnap"` → `sample.js`; `"● sample.js — omasnap"` →
  `sample.js`; VS Code `"● index.ts - omasnap - Visual Studio Code"` →
  `index.ts`; `"◐ Claude Code"` with editor other → `null`; empty → null;
  Zed with no dash and a dotted name (`"main.rs"`) → `main.rs`.
- `prepareSnap` with an injected `highlightFn` (returns canned spans) and
  `fontFn`: Zed class + title → language `javascript` from the filename,
  filename in `snap.filename`, editor `zed`; `other` class + Python
  shebang text → language `python`, `snap.filename === "python"`;
  unknown → `"snippet"` and plain spans; `language` override wins;
  truncation at 201 lines → 200 lines + the exact warning; binary NUL
  → warning; transient class (`gcr-prompter`) → editor other, filename
  null.
- CLI: run `node lib/snap.mjs` with temp files (theme dir pointed at the
  gruvbox fixture via `--theme-dir`): produces an input JSON that passes
  `validateFixture` on `.snap` and has `languages`, `detected`,
  `warnings`; the request JSON has `pictures`; empty selection → exit 3;
  re-highlight path (`--request … --language python`) changes
  `snap.language`.
- `resolveFontFamily` (in `tests/editors.test.mjs`): injected `fcMatch`
  returning `"Liberation Sans"` for `"FiraCode Nerd Font"` → substituted
  with the monospace family; returning the same family → unchanged.
- `bin/omasnap --benchmark` in a scratch env with a fake `wl-paste` (a
  script printing 60 lines) and a fake `hyprctl` (printing a Zed window
  JSON) on a restricted PATH: exit 0, prints the four timing lines, writes
  nothing under `$HOME/Pictures`, leaves no files in the runtime dir; with
  a fake `wl-paste` printing nothing → exit 0 and `notify-send` called
  (fake `notify-send` that records its args). This is the "empty-selection
  path" test the spec asks for at the script level.

### Verification by the builder (before reporting)

- `node --test tests/*.test.mjs` green.
- Live: set a primary selection from a terminal (`printf 'const a = 1;\n' | wl-copy --primary`), run `bin/omasnap` with `OMASNAP_AUTO=copy` → notification "Copied to clipboard", then `wl-paste --list-types` shows `image/png` and `wl-paste > /tmp/x.png` is a valid PNG (check the IHDR); `OMASNAP_AUTO=save` → a file under `$(xdg-user-dir PICTURES)`; delete the test file afterwards and say so. Then `bin/omasnap` without `OMASNAP_AUTO` opens the preview; close it with Esc via `hl.dsp.send_key_state` or just `qs kill -p …`. Never leave a preview open.
- `time bin/omasnap --benchmark` with a 60-line selection: report the numbers (target: total well under a second; the window adds ~300 ms).
- The grammar `.so` files must exist in the checkout you test from (`bin/build-grammars`).

## Test strategy

- Gate `test`: `node --test tests/*.test.mjs` (118 existing + new).
- Verify rule 3/4: no hex in `app`/`lib`; no Qt in `lib`.
- Rule 8: selection text goes `wl-paste` → 0600 file → Node → JSON → QML;
  never in argv or a shell; the only `sh -c` sees the PNG path. The
  reviewer greps `bin/omasnap` and `Preview.qml` for this.
- Rule 6: `qs -p app/Main.qml` in all three modes starts without QML
  errors; the reviewer runs the real flow from Zed if the desktop is
  available, else the `OMASNAP_AUTO` flow from a terminal selection, and
  the "other" path from a terminal selection.
- Deploy gate `bin/install` at ship.

## Risks and unknowns

- **`qs kill -p`** flag form: verify; fall back to `qs list`/`-i`.
- **Primary selection ownership**: when the preview window takes focus,
  the editor's primary selection persists (selection ownership does not
  change on focus), and we have already read it anyway.
- **Font substitution**: handled by `resolveFontFamily`; the preview shows
  the substituted family name in the bar only if it differs (small muted
  text) so the user understands why it is not FiraCode.
- **Large selections**: 200-line cap with a warning; the frame renders all
  200 (spec 0004 handles height); the preview scales to fit.
- **Notifications**: `notify-send` missing → log and continue.
- **Display locked during build/review**: `OMASNAP_AUTO` covers copy and
  save; the visual look of the preview bar can be checked with a
  `grabToImage` of the window content in `OMASNAP_AUTO=shot` mode writing
  `preview-shot.png` beside the spec (add this fourth value; it is cheap
  and gives the reviewer a picture of the bar).

## ADR

none — glue over ADR-0001/0002 decisions.
