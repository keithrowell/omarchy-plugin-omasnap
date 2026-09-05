---
title: Omarchy window chrome — Hyprland border, corners and gaps from the live config, maze mark in the title bar, sharp wallpaper, no wordmark
slug: omarchy-window-chrome
status: in_progress
depends_on: []
type: feature
route: foreground
business_value: high
technical_certainty: high
created: 2026-09-06
outcome: bin/omasnap --fixture renders under two themes show a window that matches this desktop's Hyprland border, rounding and gap values, the Omarchy maze glyph top-left of the title bar, a sharp wallpaper, and no logo or wordmark anywhere
claimed_by: 1a113cd5-6977-4f8d-8308-ac8ac727576e
label: 
claimed_at: 2026-09-05T21:15:41Z
---

# Omarchy window chrome — Hyprland border, corners and gaps from the live config, maze mark in the title bar, sharp wallpaper, no wordmark

## Problem / why now

Keith's verdict on the shipped frame: without the wordmark it is not obviously
an Omarchy window, and the wordmark itself is unwanted. The current frame uses
CodeSnap and macOS conventions — a floating card with a drop shadow, big
rounded corners and a blurred backdrop. What makes a window read as Omarchy
(see the theme preview images and any Omarchy desktop) is Hyprland's own
chrome: a thin accent-coloured border, the configured corner rounding, tiles
with gaps over a sharp wallpaper, and the Omarchy maze mark, which the bar
shows top-left. Make the window that.

## Acceptance criteria

- [ ] `lib/hypr.mjs` exports `readHyprlandLook()` returning `{ borderSize, rounding, gapsOut, gapsIn, activeBorder, shadowEnabled }` from `hyprctl getoption -j` (`general:border_size`, `decoration:rounding`, `general:gaps_out`, `general:gaps_in`, `general:col.active_border` — parse the first colour of the gradient string `ff7daea3 0deg`, argb → `#rrggbb`; `decoration:shadow:enabled`). When `hyprctl` is missing or fails, fall back to Omarchy's defaults (2, 0, 10, 5, the theme's `accent`, false). Tests cover the parsing and the fallback with recorded `hyprctl` output.
- [ ] The **window** in `app/Snap.qml` is drawn as Hyprland draws it: a border of `borderSize` px in `activeBorder` around the content, corners rounded by `rounding` (both scaled by the export scale so proportions match the desktop), no drop shadow unless `shadowEnabled`.
- [ ] The **header** (replaces the title bar; amended 2026-09-06 after Keith pointed at the Omarchy shell's Bluetooth panel as the reference) follows the shell's `PanelHero` + `PanelSeparator` pattern, on the **same background as the code area** — no coloured band:
  - Left: the Omarchy maze glyph (`U+E900` from the installed `omarchy` icon font, `/usr/share/fonts/omarchy/omarchy.ttf`) in `accent`, pixel size `2 × editorFontSize` (the shell uses its `display` token, 2 × base). Fallback `~/.local/share/omarchy/icon.png` tinted to `accent`; absent both, nothing.
  - Right of the glyph, gap `14 × S`: a two-line column, spacing `2 × S`: **title** = the filename (or the language when unknown) in `foreground`, bold, size `1.167 × editorFontSize` (the shell's `title` token), elided right; **subtitle** = the source and language in UPPERCASE, bold, size `0.833 × editorFontSize` (`caption` token), letter-spacing 1.2, colour `Qt.darker(foreground, 1.4)` (the shell's `dim`) — e.g. `ZED · JAVASCRIPT`, `VS CODE · PYTHON`, or `PLAIN TEXT` when nothing is known.
  - Header padding `18 × S` on all sides (the shell's `panel-padding`), then a **separator**: a 1 px full-content-width line in `foreground` at 12 % alpha (the shell's `PanelSeparator`, strength 0.12), then the code area with its existing padding.
  - `S` is the spacing scale = `editorFontSize / 12` (the shell's tokens are defined at base size 12), so the header scales with the code. Header font family = the shell's configured font (`font.family` in `~/.config/omarchy/shell.json`, else the theme's `shell.toml`, else the code font).
  - Colours only from the theme; nothing hard-coded. No trailing control on the right.
- [ ] **Margins match the desktop**: the outer margin from the image edge to the window border is `gapsOut × OUTER_GAP_FACTOR` and the inner padding from the border to the code is `gapsOut × INNER_PAD_FACTOR`, both named constants at the top of `Snap.qml` (start at 3 and 2). Line numbers and code keep their current layout inside that padding.
- [ ] **Backdrop is the sharp wallpaper**, scaled to cover, no blur and no darkening overlay. No wallpaper → flat `darker_background`.
- [ ] **No wordmark**: remove the logo image, `assets/omarchy-logo.svg`, `assets/LICENSE-omarchy-logo.txt`, the aspect-ratio and `logoSettled` plumbing, and any README mention.
- [ ] Every colour still comes from the theme or from Hyprland's live config; `grep -rnE '#[0-9a-fA-F]{6}' app lib` stays clean.
- [ ] Fixture renders regenerated for both existing render fixtures under the current theme and one contrasting theme, saved in this spec's directory; the reviewer compares them to a real Omarchy window (the theme's `preview.png`).
- [ ] The preview window (`app/Preview.qml`) shows the new frame unchanged in behaviour.

## Scope boundary

**In scope:** the chrome, the backdrop, reading Hyprland's look, removing the wordmark.

**Out of scope:** the Omarchy bar strip (rejected for now); other backdrop variants (inbox stub); an inactive-border variant; user settings for margins.

## Edge cases and failure paths

- Not running under Hyprland (fixture renders in CI, or another compositor): fallbacks apply, render still completes.
- `col.active_border` set to a multi-stop gradient: use the first stop; do not attempt to draw the gradient.
- Rounding 0: square corners, no anti-aliasing artefacts on the border.
- Light themes: the border must still be the accent, the header the same background as the code area (no coloured band); verify with the contrasting fixture.
- Tab and icon fonts: the maze glyph must not fall back to a tofu box — check `Text.fontInfo` (or `FontLoader.status`) before drawing.

## Affected areas

`lib/hypr.mjs` (new), `tests/hypr.test.mjs` (new), `lib/input.mjs`/`lib/snap.mjs` (pass the look into the frame input), `app/Snap.qml`, `app/Preview.qml`, `assets/`, `README.md`, `tests/fixtures/render/`, the renders in this spec's directory.

## Open questions

None. The margin factors are a starting judgement; Keith tunes them by eye after the first render.

## Verification

`node --test tests/*.test.mjs`; the reviewer renders both fixtures under two themes with `bin/omasnap --fixture`, opens them beside the theme's `preview.png`, and checks: border width and colour match, corner radius matches, no shadow, sharp wallpaper, maze glyph top-left in accent, no wordmark, filename and source/language in the header.
