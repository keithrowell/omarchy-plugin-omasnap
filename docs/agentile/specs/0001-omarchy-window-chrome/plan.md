# Plan — Omarchy window chrome: Hyprland border, corners and gaps from the live config, maze mark in the title bar, sharp wallpaper, no wordmark

Written by the plan stage. The build stage follows what it says. This
re-skins the frame shipped in spec 0004 (`app/Snap.qml`) so the window reads
as a Hyprland tile on this desktop; the code area, gutter, fonts, sizing
and the preview window are otherwise untouched.

## Files to touch

| File | Why |
|---|---|
| `lib/hypr.mjs` (new) | `parseOptionJson`, `firstGradientColour`, `readHyprlandLook({ run, accent })` with fallbacks. |
| `tests/hypr.test.mjs` (new) | Parsing against recorded `hyprctl` output; fallbacks; injectable runner. |
| `lib/input.mjs` | `buildInput({ snap, theme, look, headerFont, wallpaperOverride })` emits `look` and `headerFont` in the JSON; `parseUserShellFont`/`parseThemeShellFont`/`readHeaderFont` resolve the header's font family (amended 2026-09-06 — no `titleBarBackground` needed, the header has no coloured band). |
| `lib/snap.mjs` | Both CLI paths call `readHyprlandLook` and pass `look` to `buildInput`. |
| `app/Snap.qml` | The chrome: border, rounding, margins from `look`; maze glyph in the title bar; sharp wallpaper; wordmark, blur, overlay and (unless enabled) shadow removed; constants renamed. |
| `app/Preview.qml` | Only if it references removed properties (`logoSettled`, `backdropPadding`); behaviour unchanged. |
| `assets/omarchy-logo.svg`, `assets/LICENSE-omarchy-logo.txt`, `app/assets` | Delete (the symlink too if `assets/` becomes empty; keep `assets/` only if something else lives there). |
| `tests/render-fixture.test.mjs` | Input JSON carries `look`; constants-agreement check covers the new factor names. |
| `README.md` | "How it looks" paragraph: Hyprland border/rounding/gaps, sharp wallpaper, maze mark; drop any blur/wordmark wording. |
| `docs/agentile/specs/0001-omarchy-window-chrome/renders/` | Four PNGs (two fixtures × gruvbox-dark live theme, flexoki-light fixture theme) + `README.md` with the commands. |

## Environment facts (verified at plan time, 2026-09-06)

- `hyprctl getoption -j <opt>` returns one JSON object per call; the value
  key depends on the type:

  ```
  general:border_size        {"option": "general:border_size", "int": 2, "set": true }
  decoration:rounding        {"option": "decoration:rounding", "int": 6, "set": true }
  general:gaps_out           {"option": "general:gaps_out", "css": "10 10 10 10", "set": true }
  general:gaps_in            {"option": "general:gaps_in", "css": "5 5 5 5", "set": true }
  general:col.active_border  {"option": "general:col.active_border", "gradient": "ff7daea3 0deg", "set": true }
  decoration:shadow:enabled  {"option": "decoration:shadow:enabled", "bool": false, "set": true }
  ```

  (Also seen: `decoration:shadow:range` int 4, `decoration:shadow:color`
  gradient `ee1a1a1a 0deg`, `set: false` when defaulted.) The gradient
  string is space-separated stops, each `aarrggbb` hex, optionally ending
  in `<n>deg`; the CSS quad is `top right bottom left` — take the first
  number. The live desktop today: border 2, rounding 6, gaps out 10, gaps
  in 5, active border `#7daea3` (the gruvbox accent), shadow off.
- Icon font: `/usr/share/fonts/omarchy/omarchy.ttf`, fontconfig family
  name **`omarchy`**, style Regular. The maze glyph is `U+E900` per the
  spec (verify by rendering; `Text.fontInfo.family` must be `omarchy`, not
  a fallback). Fallback icon: `~/.local/share/omarchy/icon.png` (1.5 KB).
- Zed theme style has `title_bar.background`; `lib/theme.mjs` flattens it
  as `zed.style.titleBarBackground` — confirm `lib/input.mjs`'s
  `editorStyle()` forwards it (add it if not).
- Theme reference images for the reviewer:
  `~/.local/share/omarchy/themes/gruvbox/preview.png` and
  `~/.local/share/omarchy/themes/flexoki-light/preview.png`.
- `app/Snap.qml` today (395 lines): constants block at 45–75
  (`windowRadius 14`, `backdropPadding 72`, blur/overlay/shadow constants,
  `logoAspectRatio`, `markHeight`, `markMargin`); `buildFrame()` at ~123–190
  computes `padding = lineHeight`, `titleBarHeight = 2 × lineHeight`,
  `winWidth/winHeight`; section 1 backdrop with `MultiEffect` blur and
  overlay at ~200–233; section 2 window with `MultiEffect` shadow at
  ~235–355 (title bar two-rectangle trick at 264–276, title text at
  279–290); section 3 mark at ~357–395 with `ColorOverlay`. `ready` depends
  on `wallpaperSettled && logoSettled`.

## Approach

### `lib/hypr.mjs`

```js
export const OMARCHY_DEFAULTS = { borderSize: 2, rounding: 0, gapsOut: 10, gapsIn: 5, shadowEnabled: false }; // activeBorder = theme accent
export function parseOptionJson(text)          // → { int?, css?, gradient?, bool?, set } or null on bad JSON
export function firstGradientColour(gradient)  // "ff7daea3 0deg" → "#7daea3"; "7daea3" (no alpha) → "#7daea3"; garbage → null
export function firstCssNumber(css)            // "10 10 10 10" → 10; "12" → 12; garbage → null
export function readHyprlandLook({ run, accent } = {}) → { borderSize, rounding, gapsOut, gapsIn, activeBorder, shadowEnabled, source: "hyprctl" | "defaults" }
```

- `run(option)` defaults to `execFileSync("hyprctl", ["getoption", "-j",
  option], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })`;
  any throw (missing binary, not under Hyprland, bad JSON) → the whole
  result falls back to `OMARCHY_DEFAULTS` + `activeBorder: accent`,
  `source: "defaults"`. Per-option: a missing/unparseable value falls back
  for that key only. Integers are clamped to sane ranges (0–20 border,
  0–64 rounding, 0–200 gaps). No caching; pure apart from `run`.
- `accent` is required by the caller (the theme's `colors.accent`); when
  the gradient parses, `activeBorder` is the gradient's first stop (the
  desktop's real border colour), not the accent.

### `lib/input.mjs` and `lib/snap.mjs`

- `buildInput({ snap, theme, look, wallpaperOverride })` adds a top-level
  `look` object (the six fields + `source`) to the JSON; when `look` is
  omitted, call `readHyprlandLook({ accent: theme.colors.accent })` inside
  (so the CLI and `snap.mjs` both get it for free). `validate`/tests:
  `look.borderSize` etc. are numbers, `activeBorder` a `#rrggbb` string.
- `editorStyle(theme)` forwards `titleBarBackground` (from
  `zed.style.titleBarBackground`, else `colors.lighter_background`).
- `lib/snap.mjs`: no change beyond passing through (if it builds input via
  `buildInput`, it inherits the look).

### `app/Snap.qml`

Constants block (every number a named `readonly property`; QML property
names cannot start with an upper-case letter, so these are camelCase, not
the `SCREAMING_CASE` first drafted here):

```
readonly property int  exportScale: 2
readonly property real outerGapFactor: 3        // image edge → window border = gapsOut × this
readonly property real innerPadFactor: 2        // border → code = gapsOut × this
readonly property int  minWidth: 480
readonly property int  maxWidth: 1600
readonly property int  minLines: 3
readonly property int  gutterDigitsMin: 2
readonly property string ellipsis: "…"
readonly property string iconFontPath: "/usr/share/fonts/omarchy/omarchy.ttf"
readonly property string mazeGlyph: "<U+E900>"
readonly property int  shadowRange: 12          // used only when look.shadowEnabled
readonly property real shadowOpacity: 0.5

// Header (amended 2026-09-06: a PanelHero/PanelSeparator-style header
// replaces the coloured title bar — see the "Title bar" section below,
// which this supersedes).
readonly property real headerGlyphFactor: 2        // glyph pixel size = editorFontSize × this
readonly property real headerGapFactor: 14         // gap after glyph, × S
readonly property real headerSpacingFactor: 2      // title/subtitle row spacing, × S
readonly property real headerTitleFactor: 1.167    // title pixel size = editorFontSize × this
readonly property real headerCaptionFactor: 0.833  // subtitle pixel size = editorFontSize × this
readonly property real headerCaptionSpacing: 1.2   // subtitle letter-spacing, literal px (not × S)
readonly property real headerPaddingFactor: 18     // header's own padding, × S
readonly property real separatorAlpha: 0.12        // separator line, foreground at this alpha
readonly property real dimFactor: 1.4              // Qt.darker() factor for the subtitle colour
readonly property int  baseFontSize: 12            // S = editorFontSize / this
readonly property int  headerSeparatorHeight: 1    // literal 1px, like the shell's own rule
```

Derived from `input.look` (with the defaults above when absent):
`borderSize`, `rounding`, `gapsOut`, `outerMargin = round(gapsOut ×
outerGapFactor)`, `innerPad = round(gapsOut × innerPadFactor)`,
`innerRounding = max(0, rounding - borderSize)`. Note: `borderSize`/
`rounding` are used as plain logical-pixel values, **not** multiplied by
`exportScale` — `exportScale` already scales the *entire* rendered item
uniformly at `grabToImage()` time (see `Grab.js`), the same way `fontSize`
and every other logical dimension here does; multiplying border/rounding by
it too would double-scale them relative to everything else.

- **`buildFrame()`**: `padding = innerPad` (was `lineHeight`); header
  geometry as below (`headerHeight` replaces the old `titleBarHeight`);
  `winWidth/winHeight` as now but with the new padding and **including**
  the border: `winHeight = 2 × borderSize + headerHeight + 2 × padding +
  renderedLineCount × lineHeight`, i.e. the window rectangle is `borderSize`
  larger on each side than the content. Item size = window + `2 ×
  outerMargin`.
- **Section 1, backdrop**: `Rectangle { color: darker_background }` then
  `Image { source: wallpaper; fillMode: PreserveAspectCrop; asynchronous: true }`
  — **no blur, no overlay**, and no explicit `sourceSize` (the wallpaper is
  no longer downsized for a cheap blur pass, so full decode resolution is
  wanted anyway; `asynchronous: true` avoids blocking the render thread on
  a large decode). Remove `MultiEffect` blur, `wallpaperSourceWidth`,
  `blurStrength`, `blurMax`, `overlayOpacity`. See the renders' `README.md`'s
  "Wallpaper substitution" note for why the flexoki-light evidence renders
  use gruvbox's own wallpaper file (not a rendering bug — flexoki-light's
  own wallpaper is near-flat where the window covers it).
- **Section 2, window**: an outer `Rectangle` (`radius: rounding`,
  `color: look.activeBorder`) and, inset by `borderSize`, the content
  `Rectangle` (`radius: innerRounding`, `color: theme.editor.background`).
  Hyprland draws the border as a ring of `border_size` px outside the
  content at the configured rounding; two nested rectangles reproduce
  that exactly, with no `border.width` anti-aliasing seams at rounding 0.
  Shadow: keep a `MultiEffect` shadow **only when** `look.shadowEnabled`
  (`shadowBlur` from `shadowRange`, colour `darker_background`); otherwise
  no effect item at all (do not leave a disabled MultiEffect wrapping the
  window — it costs a render pass).
- **Header** (amended 2026-09-06, replacing this section's original "Title
  bar" — Keith pointed at the Omarchy shell's `PanelHero` + `PanelSeparator`
  pattern, `/usr/share/omarchy/shell/Ui/{PanelHero,PanelSeparator}.qml, as
  the reference instead of a coloured title-bar band). On the **same
  background as the code** (`theme.editor.background`, via `windowContent`
  — no separate coloured `Rectangle`):
  - `S = editorFontSize / baseFontSize`.
  - Left: the maze glyph — `FontLoader { source: "file://" + iconFontPath }`;
    `Text { text: mazeGlyph; font.family: iconFont.name; font.pixelSize:
    round(editorFontSize × headerGlyphFactor); color: colors.accent; visible:
    iconFont.status === FontLoader.Ready && fontInfo.family === iconFont.name
    }`, at `(headerPadding, headerPadding + (heroHeight - glyphSize) / 2)`.
    Fallback: when the font errors (or fails the `fontInfo` check), an
    `Image { source: "file://" + HOME + "/.local/share/omarchy/icon.png";
    visible: false }` + `ColorOverlay { color: accent }` (Qt5Compat is
    already imported); if that image errors too, nothing.
  - Right of the glyph, gap `headerGapFactor × S`: a `Column` (spacing
    `headerSpacingFactor × S`) of **title** (`filename ?? language ?? "snippet"`,
    `foreground`, bold, `round(editorFontSize × headerTitleFactor)`, elide
    right) and **subtitle** (`[sourceLabel, languageLabel].filter(Boolean).join(" · ")`
    where `sourceLabel` is `"ZED"`/`"VS CODE"`/omitted-for-`"other"`, and
    `languageLabel` is `language.toUpperCase()` or `"PLAIN TEXT"` when
    `null`; colour `Qt.darker(foreground, dimFactor)`, bold,
    `round(editorFontSize × headerCaptionFactor)`, `font.letterSpacing:
    headerCaptionSpacing`). Each row's height is a local `headerLineHeightRatio
    (1.2)` × its pixel size — a typographic approximation for the row's own
    line box, deliberately distinct from the code area's per-editor
    `lineHeightFactor`.
  - `headerPadding = round(headerPaddingFactor × S)` on every side of the
    hero row (glyph + column); then a **separator** — `Rectangle { height:
    headerSeparatorHeight (literal 1px); width: contentWidth; color:
    Qt.rgba(foreground.r, foreground.g, foreground.b, separatorAlpha) }`
    spanning the full content width (not inset by `headerPadding`) — then
    the code area with its existing `innerPad`.
  - `heroHeight = max(glyphSize, titleLineHeight + headerSpacing +
    captionLineHeight)`; `headerHeight = 2 × headerPadding + heroHeight +
    headerSeparatorHeight`.
  - Header font family = `input.headerFont` (see `lib/input.mjs` above),
    falling back to the code font.
- **Gutter and code**: unchanged, positioned inside the content rectangle
  at `borderSize + innerPad`, `y` offset by `headerHeight + innerPad`
  (`headerHeight` replaces the old `titleBarHeight` here).
- **Remove**: section 3 (mark), `logoImage`, `ColorOverlay` for the logo,
  `logoAspectRatio`, `markHeight`, `markMargin`, `logoSettled`;
  `ready = frame !== null && wallpaperSettled && (iconFont.status !==
  FontLoader.Loading)` (a font that fails to load must not block the grab).
- Every colour still comes from `input.theme` or `input.look`; the only
  literals are the font path and the glyph codepoint. `grep -rnE
  '#[0-9a-fA-F]{6}' app lib` stays empty.

### `app/Preview.qml` and `app/Main.qml`

`Main.qml` render mode and `Preview.qml` only use `snap.ready`,
`snap.width/height` and `Grab.js`; grep for `backdropPadding`,
`logoSettled`, `markHeight` and fix any reference. The preview bar is
unchanged.

### Tests

`tests/hypr.test.mjs`:
- `parseOptionJson` on each recorded line above (int, css, gradient, bool)
  and on garbage → null.
- `firstGradientColour`: `"ff7daea3 0deg"` → `#7daea3`; `"aa595959 0deg"` →
  `#595959`; two stops `"ff112233 ff445566 45deg"` → `#112233`; `"7daea3"`
  (6 hex, no alpha) → `#7daea3`; `""`/`"nonsense"` → null.
- `firstCssNumber`: `"10 10 10 10"` → 10; `"3 4"` → 3; `"x"` → null.
- `readHyprlandLook` with an injected `run` that returns the recorded
  outputs → `{ 2, 6, 10, 5, "#7daea3", false, source: "hyprctl" }`; with
  `run` throwing → defaults + `activeBorder === accent`, `source:
  "defaults"`; with one option unparseable → that key defaults, others
  live; clamping (border 999 → 20).

`tests/render-fixture.test.mjs`: `buildInput` with an explicit `look`
puts it in the JSON; without one and with `readHyprlandLook` failing
(inject via an env/param — simplest: `buildInput` accepts `look` and the
test always passes one; the CLI path is covered by running
`node lib/input.mjs` and asserting `look` has the six keys); constants
check now asserts `outerGapFactor`, `innerPadFactor`, `minWidth`,
`maxWidth`, `minLines` appear in `Snap.qml`; also covers `lib/input.mjs`'s
`headerFont` field and its `parseUserShellFont`/`parseThemeShellFont`/
`readHeaderFont` helpers (see the "header" amendment above).

`tests/snap.test.mjs`: the script-level tests still pass (the fake
`hyprctl` there only answers `activewindow -j`; make the fake answer
`getoption` with `{}` or nothing so the look falls back — assert the
run still succeeds).

### Renders (evidence)

```
bin/omasnap --fixture tests/fixtures/render/hello.json --wallpaper ~/.local/share/omarchy/themes/gruvbox/backgrounds/1-the-backwater.jpg --out <spec>/renders/hello-gruvbox-dark.png
bin/omasnap --fixture tests/fixtures/render/long.json  --wallpaper ~/.local/share/omarchy/themes/gruvbox/backgrounds/1-the-backwater.jpg --out <spec>/renders/long-gruvbox-dark.png
bin/omasnap --fixture tests/fixtures/render/hello.json --theme-dir tests/fixtures/themes/flexoki-light/theme --wallpaper "$(ls ~/.local/share/omarchy/themes/flexoki-light/backgrounds/* | head -1)" --out <spec>/renders/hello-flexoki-light.png
bin/omasnap --fixture tests/fixtures/render/long.json  --theme-dir tests/fixtures/themes/flexoki-light/theme --wallpaper "$(ls ~/.local/share/omarchy/themes/flexoki-light/backgrounds/* | head -1)" --out <spec>/renders/long-flexoki-light.png
```

Note the live look comes from this desktop (`hyprctl`), so the flexoki
renders show the gruvbox accent border unless `activeBorder` is the
theme accent — that is correct behaviour (the border is Hyprland's, not
the theme's); say so in `renders/README.md`. **Look at all four** beside
`~/.local/share/omarchy/themes/gruvbox/preview.png`: 2 px accent border,
6 px rounding, sharp wallpaper, slim title bar with the maze glyph at the
left in accent and the filename centred, no shadow, no wordmark, margins
that read like Hyprland gaps. Also render `long.json` once with a fake
`hyprctl` on PATH that prints nothing (fallback look) to prove the
non-Hyprland path completes.

## Test strategy

- Gate `test`: `node --test tests/*.test.mjs` (147 existing + new).
- Verify rule 3/4 greps; rule 5/8: the only new subprocess is `hyprctl
  getoption -j <constant>` with fixed argv.
- Rule 6: `timeout 3 qs -p app/Main.qml` (placeholder), the four renders,
  and one `OMASNAP_AUTO=shot bin/omasnap` on a terminal selection to prove
  the preview still works with the new frame (kill any leftover instance;
  `qs list -a -j`).
- Rule 7: `readHyprlandLook` runs per snap; nothing cached.
- Reviewer compares the renders with the theme `preview.png`s.

## Risks and unknowns

- **Glyph codepoint**: if `U+E900` renders as tofu or the wrong glyph,
  inspect the font (`fc-query`, or `python -c` with fontTools if
  installable via pacman `python-fonttools` — no sudo, so instead use
  `strings`/`otfinfo` if present, or simply render a few candidate
  codepoints ``–`` in a throwaway QML and look). Record the
  codepoint actually used in the constant's comment.
- **Rounding vs border**: Hyprland's content corner radius is `rounding -
  border_size` (clamped at 0); the nested-rectangle approach matches. If
  the reviewer sees a light seam at the corners, set `antialiasing: true`
  on both rectangles.
- **Wallpaper decode size**: sharp backdrop at 2× on a 1600-wide frame
  means a ~3500 px wide decode; `sourceSize.width` bounds it. Measure one
  long render's wall time (should stay ~1 s).
- **Fallback look on CI/non-Hyprland**: covered by the fake-`hyprctl`
  render and the tests.
- **Preview bar** keeps its own theme-styled buttons; only the frame
  changed.

## ADR

none — the look now follows Hyprland's live config, which is a
consequence of ADR-0001's "every colour from the theme" principle
extended to chrome geometry; recorded in `lib/hypr.mjs`'s header and
README.
