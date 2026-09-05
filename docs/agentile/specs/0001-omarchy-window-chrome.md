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
- [ ] The **title bar** stays, slim, in the Zed theme's `title_bar.background` (fallback `lighter_background`): the Omarchy maze glyph (`U+E900` from the installed `omarchy` icon font, `/usr/share/fonts/omarchy/omarchy.ttf`, rendered in `accent`) at the left where traffic lights would be, and the filename or language centred as now. If the font is not installed, fall back to `~/.local/share/omarchy/icon.png` tinted to `accent`; if that is absent too, draw nothing there.
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
- Light themes: the border must still be the accent, the title bar the theme's title-bar colour; verify with the contrasting fixture.
- Tab and icon fonts: the maze glyph must not fall back to a tofu box — check `Text.fontInfo` (or `FontLoader.status`) before drawing.

## Affected areas

`lib/hypr.mjs` (new), `tests/hypr.test.mjs` (new), `lib/input.mjs`/`lib/snap.mjs` (pass the look into the frame input), `app/Snap.qml`, `app/Preview.qml`, `assets/`, `README.md`, `tests/fixtures/render/`, the renders in this spec's directory.

## Open questions

None. The margin factors are a starting judgement; Keith tunes them by eye after the first render.

## Verification

`node --test tests/*.test.mjs`; the reviewer renders both fixtures under two themes with `bin/omasnap --fixture`, opens them beside the theme's `preview.png`, and checks: border width and colour match, corner radius matches, no shadow, sharp wallpaper, maze glyph top-left in accent, no wordmark, filename centred.
