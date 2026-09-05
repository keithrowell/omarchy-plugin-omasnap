# Plan — Frame renderer: the Omarchy-styled window, blurred-wallpaper backdrop and PNG export in QML

Written by the plan stage. The build stage follows what it says. This is the
first real QML in the project; ADR-0001 and `.agentile/build.md` apply:
logic in `lib/`, drawing in `app/`, every colour from the theme, nothing
cached across runs. The Pacman plugin (`/home/keith/Dropbox
(Maestral)/lab/omarchy_pacman/app/Main.qml`, `app/Theme.qml`) is the model for
Quickshell idioms (`ShellRoot`/`FloatingWindow`, `FileView`, `grabToImage`,
`Quickshell.env`, the `app/lib` and `app/assets` symlinks).

## The one design decision

**Node prepares, QML draws.** The spec allows "a small JS bridge (`Theme.js`
or a `Theme.qml` singleton that shells out to Node)". `lib/theme.mjs` uses
`node:fs`, so it cannot be imported by QML, and a QML→Node subprocess round
trip inside the window adds plumbing for nothing. Instead `bin/omasnap`
runs Node **before** Quickshell to produce one JSON *input* file (theme
colours + the snap: filename, language, editor, font, resolved spans), then
starts `qs` with two environment variables (`qs` forwards no CLI arguments
to QML — verified with `qs --help`):

- `OMASNAP_INPUT` — path of the JSON the window renders;
- `OMASNAP_OUT` — when set, render mode: grab the frame at 2× to this PNG and quit.

This keeps `app/` render-only and is the same shape spec 0006 needs
(`lib/snap.mjs` will produce the same input from the live selection).

## Files to touch

| File | Why |
|---|---|
| `lib/input.mjs` | `validateFixture(obj)`, `buildInput({ snap, theme })`, `resolveSpans(lines, theme)`; CLI entry (`node lib/input.mjs --fixture F [--theme-dir D] [--wallpaper W]`) printing the input JSON to stdout. |
| `app/Snap.qml` | The composition: backdrop → shadow → window (title bar, gutter, code), Omarchy mark. Named constants at the top. |
| `app/Main.qml` | Two modes: render mode when `OMASNAP_INPUT` is set (load the input, show `Snap`, grab, save, quit); otherwise the existing placeholder (unchanged until spec 0006). |
| `app/assets -> ../assets` | Symlink (Quickshell refuses files outside the shell root; Pacman does the same). |
| `assets/omarchy-logo.svg` | Vendored copy of `~/.local/share/omarchy/logo.svg` (MIT; add `assets/LICENSE-omarchy-logo.txt` noting the source). |
| `bin/omasnap` | `--fixture <json> --out <png> [--theme-dir <dir>] [--wallpaper <file>]`; runs Node, exports the env vars, execs `qs`; cleans the temp input. `-h`. No flags → placeholder as today. |
| `tests/fixtures/render/hello.json`, `tests/fixtures/render/long.json` | JS snippet (8–12 lines) and a 40-line Python snippet with one line over 200 chars. Spans carry **capture names**, not colours. |
| `tests/render-fixture.test.mjs` | Fixture shape, `resolveSpans` against the gruvbox and flexoki fixture themes, CLI prints valid JSON, clipping helper. |
| `docs/agentile/specs/0004-frame-renderer/renders/*.png` | Evidence: both fixtures × (gruvbox-dark live theme, flexoki-light fixture theme). |
| `README.md` | One paragraph: the `--fixture` render mode. |

## Environment facts (verified at plan time, 2026-09-05)

- Quickshell 0.3.1; Qt 6.11.2 with `qt6-declarative` (includes
  `QtQuick.Effects` → `MultiEffect`), `qt6-svg`, `qt6-imageformats`
  (`libqwebp.so` present, so the `omarchy.webp` wallpaper loads).
  `MultiEffect` properties available: `source`, `blurEnabled`, `blur`,
  `blurMax`, `blurMultiplier`, `brightness`, `saturation`, `colorization`,
  `colorizationColor`, `shadowEnabled`, `shadowColor`, `shadowBlur`,
  `shadowOpacity`, `shadowScale`, `shadowHorizontalOffset`,
  `shadowVerticalOffset`, `autoPaddingEnabled`, `paddingRect`.
- Quickshell APIs: `Quickshell.env("NAME")` (string or undefined),
  `Quickshell.Io.FileView { path; text(); onLoaded; onLoadFailed;
  printErrors }`, `FloatingWindow { title; implicitWidth; implicitHeight;
  color; visible; onClosed }` — note `onClosed`, not `onClosing` (spec 0001
  found this). `Item.grabToImage(callback, targetSize)` and
  `result.saveToFile(path)` work in Quickshell (Pacman's F12 grab).
- Monitor: `eDP-1` 2560×1600 at Hyprland scale **1.6**. `grabToImage` with
  an explicit `targetSize` renders the item at that pixel size regardless
  of the screen scale, so "2× device pixels" is
  `grabToImage(cb, Qt.size(item.width * 2, item.height * 2))`.
- Fonts: **"FiraCode Nerd Font" (the Zed setting) is not installed**; only
  JetBrainsMono Nerd Font is. Qt substitutes an unknown family with the
  default font, which may be proportional — set `font.styleHint:
  Font.Monospace` on every code `Text` so the substitute is monospace.
- Logo: `~/.local/share/omarchy/logo.svg`, 1215×285 viewBox, paths filled
  `#000` inside one `<g fill="#000">`. Recolour at render time with
  `MultiEffect { colorization: 1.0; colorizationColor: accent }` — do not
  edit the SVG's colour (a hex literal in `assets/` is fine as vendored
  data, but the recolour must be theme-driven).
- The live theme is gruvbox-dark; `tests/fixtures/themes/{gruvbox-dark,
  flexoki-light}/theme` are the two fixture theme dirs from spec 0003
  (their `background` symlink points at a 716-byte `omarchy.webp`, which
  is fine for tests but ugly as a backdrop — use `--wallpaper` for the
  review renders, e.g. the first file under
  `~/.local/share/omarchy/themes/flexoki-light/backgrounds/`).
- `XDG_RUNTIME_DIR=/run/user/1001` for the temp input file.

## Approach

### `lib/input.mjs`

```js
export function validateFixture(obj)                    // throws with a path like "lines[3][1].text" on the first problem
export function resolveSpans(lines, theme)              // capture → { text, color, fontStyle, fontWeight } via zedSyntaxStyle; explicit colours pass through
export function buildInput({ snap, theme, wallpaper }) // → the JSON the window renders
export const CONSTANTS = { minWidth: 480, maxWidth: 1600, minLines: 3, tabWidth: 4 }  // shared with tests; Snap.qml declares its own copy (QML cannot import node modules) — the test asserts the two agree by grepping Snap.qml
```

- Fixture shape (`validateFixture`): `{ filename: string|null, language:
  string|null, editor: "zed"|"vscode"|"other", font: { family: string,
  size: number }, lines: [ [ { text: string, capture?: string, color?:
  string, fontStyle?: "italic"|null, fontWeight?: number|null } ] ] }`.
  Every span's `text` is a string (may be empty only if it is the line's
  sole span); tabs allowed; no newlines inside a span.
- `resolveSpans`: for each span, if `color` present keep it (and its
  style fields); else if `capture` present → `zedSyntaxStyle(theme.zed,
  capture)`; else → editor foreground plain. If `theme.zed` is null, colour
  everything with `theme.colors.foreground`. Expand tabs to
  `CONSTANTS.tabWidth` spaces (column-aware: pad to the next multiple).
- `buildInput` returns:

  ```json
  {
    "snap": { "filename", "language", "editor", "font": { "family", "size" }, "lines": [[resolved spans]] },
    "theme": {
      "name", "mode",
      "colors": { ...every colors.toml key... },
      "editor": { "background", "foreground", "gutterBackground", "lineNumber", "lineNumberActive", "selectionBackground" },
      "wallpaper": "/abs/path or null"
    },
    "meta": { "generatedAt": ISO8601, "themeDir": "..." }
  }
  ```

  `theme.editor` comes from `theme.zed.style` when present (editor
  `"vscode"` may later use the VS Code colours; for this spec Zed's are
  used for every editor and that is written in the module header), else
  from `colors.toml` (`background`, `foreground`, `dark_foreground`,
  `foreground`, `selection`). `wallpaper` = the `--wallpaper` override if
  given, else `theme.wallpaper`; if the file does not exist → `null`.
- CLI (`import.meta.url` main check): `--fixture F` (required),
  `--theme-dir D` (default `DEFAULT_THEME_DIR`), `--wallpaper W`; prints
  JSON; exit 2 with a message on bad args or an invalid fixture. No hex
  literals anywhere in this module.

### `bin/omasnap`

Keep the existing `qs` check. Parse `--fixture`, `--out`, `--theme-dir`,
`--wallpaper`, `-h`; unknown option → usage, exit 2. If `--fixture` is
given: require `node` on PATH (hint `sudo pacman -S nodejs`); `--out` is
required with `--fixture` for this spec (the preview comes in 0006);
`INPUT="${XDG_RUNTIME_DIR:-/tmp}/omasnap/input-$$.json"`; run
`node "$ROOT/lib/input.mjs" --fixture "$F" ${THEME_DIR:+--theme-dir "$THEME_DIR"} ${WALLPAPER:+--wallpaper "$WALLPAPER"} > "$INPUT"`
(propagate its exit status); then
`OMASNAP_INPUT="$INPUT" OMASNAP_OUT="$OUT" qs -p "$ROOT/app/Main.qml"`; `trap`
removes `$INPUT`; exit with `qs`'s status; print `wrote <out>` on success
(check the file exists and is non-empty). Without `--fixture`, `exec qs`
exactly as today. All paths quoted (the checkout path has a space).

### `app/Main.qml`

```
ShellRoot {
  readonly property string inputPath: Quickshell.env("OMASNAP_INPUT") || ""
  readonly property string outPath:   Quickshell.env("OMASNAP_OUT") || ""
  Loader { active: inputPath !== "";  sourceComponent: renderWindow }
  Loader { active: inputPath === "";  sourceComponent: placeholderWindow }   // the existing placeholder, moved verbatim into a Component
}
```

`renderWindow`: a `FloatingWindow` titled "Omasnap" whose size follows
`snap.implicitWidth/Height`; `FileView { path: inputPath; blockLoading:
true }` → `JSON.parse(text())` → `Snap { input: … }`. Render flow: when
`snap.ready` (all `Image`s `Ready` or `Error`, fonts resolved) fire a
`Timer { interval: 250 }` (two frames of settle), then
`snap.grabToImage(r => { ok = r.saveToFile(outPath); console.info(...);
Qt.quit() }, Qt.size(snap.width * Snap.exportScale, snap.height *
Snap.exportScale))`. A 5 s `Timer` guard logs "render: timed out" and
quits. Errors (input unreadable, JSON invalid) log `render: …` and quit.
The window will be visible for a fraction of a second; that is accepted
for this spec (spec 0006's preview shows it anyway). Closing the window
quits (`onClosed: Qt.quit()`).

### `app/Snap.qml`

`Item` with `property var input`, `readonly property bool ready`, and
**named constants at the top** (every size in logical px):

```
readonly property int  exportScale: 2
readonly property int  windowRadius: 14
readonly property int  padding: lineHeight         // one line height, computed
readonly property int  backdropPadding: 72
readonly property int  titleBarHeight: Math.round(lineHeight * 2)
readonly property int  minWidth: 480
readonly property int  maxWidth: 1600
readonly property int  minLines: 3
readonly property real lineHeightFactor: editor === "zed" ? 1.618 : editor === "vscode" ? 1.35 : 1.5   // Zed's "comfortable", VS Code's default
readonly property real blurStrength: 1.0
readonly property int  blurMax: 64
readonly property int  wallpaperSourceWidth: 960   // the backdrop is blurred anyway; a small source keeps MultiEffect cheap (answers the spec's open question)
readonly property real overlayOpacity: 0.4
readonly property int  shadowOffsetY: 18
readonly property real shadowBlur: 1.0
readonly property real shadowOpacity: 0.55
readonly property int  gutterDigitsMin: 2
readonly property int  markHeight: titleBarHeight
readonly property string ellipsis: "…"
```

Composition (bottom to top), all colours read from `input.theme`:

1. **Backdrop** `Rectangle { color: theme.colors.darker_background }`
   filling the item. If `theme.wallpaper`: `Image { source: "file://" +
   wallpaper; fillMode: Image.PreserveAspectCrop; sourceSize.width:
   wallpaperSourceWidth; visible: false; asynchronous: false }` +
   `MultiEffect { source: wallpaperImage; anchors.fill; blurEnabled: true;
   blur: blurStrength; blurMax: blurMax; autoPaddingEnabled: false }`,
   then `Rectangle { color: darker_background; opacity: overlayOpacity }`.
   If the `Image` reports `Error` → it simply stays invisible and the flat
   colour shows (the spec's "no error" path).
2. **Omarchy mark**, anchored bottom-right inside `backdropPadding`:
   `Image { source: Qt.resolvedUrl("assets/omarchy-logo.svg");
   sourceSize.height: markHeight * exportScale; height: markHeight;
   fillMode: PreserveAspectFit; visible: false }` + `MultiEffect { source;
   colorization: 1.0; colorizationColor: theme.colors.accent }` and a
   `Text { text: "omarchy"; color: theme.colors.muted; font: editor font
   family, pixelSize ~ lineHeight * 0.9 }` to its right (or below if the
   logo already contains the wordmark — check the SVG: it is the wordmark
   glyphs; if so drop the separate `Text` and say so in the report).
3. **Window** `Item` (`id: win`) sized from content, centred with
   `backdropPadding` on every side, wrapped in `MultiEffect { source: win;
   shadowEnabled: true; shadowColor: darker_background; shadowBlur;
   shadowOpacity; shadowVerticalOffset: shadowOffsetY; autoPaddingEnabled:
   true }`. Inside `win`:
   - Base `Rectangle { radius: windowRadius; color: theme.editor.background }`
     covering the whole window (so the bottom corners are rounded for free).
   - **Title bar**: `Rectangle { height: titleBarHeight; radius:
     windowRadius; color: theme.colors.lighter_background }` plus a square
     `Rectangle` of the same colour covering its bottom half so only the top
     corners are rounded (no clipping needed). Centred `Text { text:
     filename ?? language ?? "snippet"; color: theme.colors.foreground;
     font: editor font, pixelSize: font.size }`. **Nothing else in the bar.**
   - **Gutter + code**: below the bar, `padding` on all sides. Gutter width
     = width of `max(lines, gutterDigitsMin)` digits in the code font +
     one character gap; numbers right-aligned in `theme.editor.lineNumber`
     starting at 1, one per rendered line (including the padded blank lines
     when `lines < minLines`, which render as empty). Code: a `Column` of
     rows, each `Row` of `Text` spans: `text: span.text`, `color:
     span.color`, `font.family: snap.font.family`, `font.pixelSize:
     snap.font.size`, `font.italic: span.fontStyle === "italic"`,
     `font.weight: span.fontWeight ?? Font.Normal`, `font.styleHint:
     Font.Monospace`, `textFormat: Text.PlainText`, `renderType:
     Text.NativeRendering`? — no: keep the default `QtRendering` so 2× grabs
     stay crisp (distance-field text scales). Row height = `lineHeight`;
     vertical alignment centre.
4. **Sizing**: `TextMetrics` with the code font measures the longest line
   (join span texts) → `codeWidth`. `winWidth = clamp(gutter + codeWidth +
   2*padding, minWidth, maxWidth)`. If any line exceeds the available code
   width, clip it: measure how many characters fit (`TextMetrics.elide`
   is for single strings, so do it in JS on the joined text with the
   average glyph advance of the monospace font: `charsThatFit =
   floor(available / advance) - 1`), truncate the spans to that many
   characters and append an ellipsis span `{ text: ellipsis, color:
   theme.colors.muted }`. `winHeight = titleBarHeight + 2*padding +
   max(lines, minLines) * lineHeight`. Item size = window + 2*backdropPadding
   each way (+ shadow room is inside the padding).
5. **`ready`**: true when the wallpaper `Image` and the logo `Image` are
   `Ready` or `Error` (or absent) and `TextMetrics` has a non-zero advance.

No hex literal and no named colour anywhere in `app/`; the `grep -rnE
'#[0-9a-fA-F]{6}' app` must stay empty. Every size/radius/opacity above is
a named constant; nothing inline.

### Fixtures

- `tests/fixtures/render/hello.json`: `filename: "hello.js"`, `language:
  "javascript"`, `editor: "zed"`, `font: { family: "JetBrainsMono Nerd
  Font", size: 13 }`, ~10 lines of a small JS function with captures from
  Zed's vocabulary (`keyword`, `function`, `variable`, `string`,
  `punctuation.bracket`, `punctuation.delimiter`, `comment`, `number`,
  `operator`, `property`).
- `tests/fixtures/render/long.json`: `filename: "pipeline.py"`,
  `language: "python"`, `editor: "zed"`, 40 lines of plausible Python
  including a decorator (`attribute`), a docstring (`string.doc` → falls
  back to `string`), an f-string, and one line longer than 200 characters
  (a long list literal) to exercise clipping.
- Hand-write the spans (a builder-side helper script under the spec
  directory may generate them from a token list; do not add it to `lib/`).

### Tests — `tests/render-fixture.test.mjs`

- Both fixtures pass `validateFixture`; a corrupted copy (a span with no
  `text`, a line that is not an array) throws naming the path.
- `resolveSpans` against `readTheme("tests/fixtures/themes/gruvbox-dark/theme")`:
  `keyword` gets `theme.zed.syntax.keyword.color` and its `fontWeight`;
  `punctuation.delimiter.x` falls back to `punctuation.delimiter`; an
  unknown capture gets the editor foreground; an explicit `color` passes
  through unchanged; a tab expands to the next multiple of 4 columns; every
  line's spans concatenate to the original text (with tabs expanded).
- Same against the flexoki-light theme: colours differ from gruvbox.
- `buildInput` with `wallpaper` pointing at a missing file → `null`; with
  the fixture theme → the resolved `omarchy.webp` path; `theme.editor.*`
  populated from Zed; with a theme whose `zed` is null → from `colors`.
- CLI: `node lib/input.mjs --fixture tests/fixtures/render/hello.json
  --theme-dir tests/fixtures/themes/gruvbox-dark/theme` prints JSON with
  `snap.lines.length === fixture lines`, exit 0; missing `--fixture` → exit 2.
- Constants agreement: read `app/Snap.qml` as text and assert the
  `minWidth`/`maxWidth`/`minLines` values equal `CONSTANTS`.

### Renders (evidence for the reviewer)

From the worktree, produce four PNGs into the spec directory:

```
bin/omasnap --fixture tests/fixtures/render/hello.json --out docs/agentile/specs/0004-frame-renderer/renders/hello-gruvbox-dark.png
bin/omasnap --fixture tests/fixtures/render/long.json  --out docs/agentile/specs/0004-frame-renderer/renders/long-gruvbox-dark.png
bin/omasnap --fixture tests/fixtures/render/hello.json --theme-dir tests/fixtures/themes/flexoki-light/theme --wallpaper "$(ls ~/.local/share/omarchy/themes/flexoki-light/backgrounds/* | head -1)" --out docs/agentile/specs/0004-frame-renderer/renders/hello-flexoki-light.png
bin/omasnap --fixture tests/fixtures/render/long.json  --theme-dir tests/fixtures/themes/flexoki-light/theme --wallpaper "$(ls ~/.local/share/omarchy/themes/flexoki-light/backgrounds/* | head -1)" --out docs/agentile/specs/0004-frame-renderer/renders/long-flexoki-light.png
```

(The first two use the live theme and the live wallpaper.) **Look at
them** (the Read tool renders PNGs) against the spec's checklist before
reporting: no traffic lights; title bar in `lighter_background` with the
filename centred; wallpaper visible and clearly blurred; the window reads
clearly over it; Omarchy mark in accent bottom-right; line numbers from 1;
span colours varying by capture; italic comments; the long line ends in an
ellipsis inside the window; PNG pixel size = 2 × logical size (`file
x.png` or `node -e` reading the IHDR). Keep each PNG under ~1.5 MB
(2× of ~1700×1200 is fine).

## Test strategy

- Gate `test`: `node --test tests/*.test.mjs` (58 existing + new).
- Verify rule 3: `grep -rnE '#[0-9a-fA-F]{6}' app lib` → nothing (the
  vendored SVG lives in `assets/`, not `app/`; `app/assets` is a symlink and
  `grep -r` does not follow symlinked directories by default — confirm with
  the grep output).
- Verify rule 4: `grep -rn 'import Qt\|Qt\.' lib` → nothing.
- Verify rule 6: `timeout 3 qs -p app/Main.qml` (placeholder mode) still
  starts without QML errors; and the four render commands above exit 0 with
  no `QML` error lines in the Quickshell log (paste the log of one run).
- Spec verification: the reviewer re-renders both fixtures under two themes
  and checks the checklist visually.
- Deploy gate `bin/install` at ship (unchanged behaviour).

## Risks and unknowns

- **`MultiEffect` inside Quickshell.** It is plain Qt Quick, so it should
  load; if `import QtQuick.Effects` fails, the fallback is `Qt5Compat.
  GraphicalEffects` (`FastBlur`, `ColorOverlay`, `DropShadow`; `qt6-5compat`
  is installed) — record which was used in the report and keep the
  constants identical.
- **Blur cost at 2×** (the spec's open question): decided by design — the
  wallpaper is sampled at `wallpaperSourceWidth` (960 px) before blurring,
  and the blur runs on the on-screen scene once; the 2× grab re-renders the
  scene graph at 2× which is a single extra frame. If a render takes over
  ~2 s on this machine, halve `wallpaperSourceWidth` and note it.
- **Rounded corners without clipping**: the two-rectangle title-bar trick
  avoids `layer` + `OpacityMask`. If the gutter is later given its own
  background it will need the same trick on the left corners.
- **Font substitution**: with FiraCode absent, the render uses the
  substitute monospace; the report must state which family actually
  rendered (`TextMetrics.font.family` after resolution or `fc-match
  "FiraCode Nerd Font"`), so the reviewer does not mistake it for a bug.
- **Window flash** in render mode on the live desktop: a floating window
  appears for well under a second per render. Accepted; do not try to hide
  it with off-screen tricks in this spec.
- **`saveToFile` path**: must be absolute; `bin/omasnap` resolves `--out`
  with `readlink -f "$(dirname "$OUT")"/$(basename "$OUT")` before exporting.
- **Hyprland window rule not applied**: without the float rule the render
  window tiles briefly and may resize; `grabToImage` grabs the `Snap` item
  at its own size, so the PNG is unaffected. The `FloatingWindow` should
  still request `implicitWidth/Height` = the item size.

## ADR

none — implements ADR-0001 (QML renders, JS decides; colours from the theme).
The "Node prepares the input, QML draws" split is recorded in
`lib/input.mjs`'s header and `README.md`; if spec 0006 finds it wanting, that
is the moment for an ADR.
