---
title: Frame renderer — the Omarchy-styled window, blurred-wallpaper backdrop and PNG export in QML
slug: frame-renderer
status: in_progress
depends_on: [theme-reader]
type: feature
route: foreground
business_value: high
technical_certainty: medium
created: 2026-09-05
outcome: bin/omasnap --fixture tests/fixtures/render/hello.json --out /tmp/x.png produces a PNG that a reviewer judges as obviously Omarchy against the checklist below, under two different themes
claimed_by: 1a113cd5-6977-4f8d-8308-ac8ac727576e
label: 
claimed_at: 2026-09-05T13:17:59Z
---

# Frame renderer — the Omarchy-styled window, blurred-wallpaper backdrop and PNG export in QML

## Problem / why now

The second outcome in the brief is a frame that is beautiful and unmistakably
Omarchy. This spec builds the picture: a CodeSnap-style composition (rounded
window, title bar, line numbers, padding, shadow, watermark, backdrop) with
every colour from the theme and no macOS traffic lights. It renders from a
JSON fixture so it can be built and reviewed before the highlighter lands.

## Acceptance criteria

- [ ] `app/Snap.qml` renders an input of `{ filename, language, editor, font: {family,size}, lines: [[spans]] }` (the highlighter's output plus metadata) using colours from `readTheme()` exposed to QML by a small JS bridge (`app/Theme.js` or a `Theme.qml` singleton that shells out to Node, mirroring Pacman's `Theme.qml`).
- [ ] Composition, top to bottom: backdrop → shadow → window. The **window** has rounded corners (radius from a single constant), a title bar in `lighter_background` showing the filename (or the language when unknown) centred in `foreground` at the editor font, **no traffic lights**; the code area in the Zed theme's editor background; a **line-number gutter** in the theme's line-number colour starting at 1; code in the editor font with span colours, styles and weights honoured; padding of one line height around the code.
- [ ] **Backdrop**: the current wallpaper (`theme.wallpaper`) scaled to cover, blurred (Qt6 `MultiEffect`, blur enabled, strength from a constant) and darkened with an overlay of `darker_background` at ~40% so the window reads clearly; when there is no wallpaper, a flat `darker_background`.
- [ ] **Omarchy mark**: the Omarchy logo (vendored SVG from `~/.local/share/omarchy/logo.svg`, recoloured to `accent`) in the backdrop's bottom-right corner at roughly title-bar height, with the wordmark "omarchy" beside it in `muted`.
- [ ] **Shadow**: a soft drop shadow under the window in `darker_background`.
- [ ] Output size follows content: the window is as wide as the longest line (minimum 480 px, maximum 1600 px with horizontal wrapping disabled and lines clipped with an ellipsis span) plus padding; rendered at 2× device pixels for crispness.
- [ ] `bin/omasnap --fixture <json> --out <png>` renders the fixture headlessly (a Quickshell window that grabs itself to the PNG then quits) so builders and reviewers can produce images without an editor.
- [ ] Two fixtures under `tests/fixtures/render/`: a short JavaScript snippet and a 40-line Python snippet with a long line, plus their rendered PNGs under the spec directory for the current theme and one contrasting theme.
- [ ] `grep -rnE '#[0-9a-fA-F]{6}' app` returns nothing; all sizes and radii are named constants at the top of `Snap.qml`.

## Scope boundary

**In scope:** the look, the fixture render path, PNG export.

**Out of scope:** the preview window with buttons (next spec); reading the selection; other backdrop variants (gradient, solid, transparent are captured as future stubs); user-adjustable padding or radius.

## Edge cases and failure paths

- Wallpaper file missing or unreadable: flat backdrop, no error.
- Fonts not installed: Qt falls back; the render still completes.
- One-line selection: window still looks composed (minimum height of three lines).
- Very long selection (over 80 lines): render all of them; the preview spec decides on scrolling.
- Nerd Font ligatures: rendered as the font provides; no special handling.

## Affected areas

`app/Snap.qml`, `app/Theme.qml` (or `Theme.js`), `app/Main.qml` (fixture mode only), `assets/omarchy-logo.svg`, `bin/omasnap`, `tests/fixtures/render/`, `tests/render-fixture.test.mjs` (validates fixture shape).

## Open questions

Whether `MultiEffect` blur performs acceptably at 2× on a 1600 px canvas; if not, pre-blur the wallpaper once with a lower-resolution source. Decide in the plan, not a spike.

## Verification

The reviewer renders both fixtures under two themes with `bin/omasnap --fixture` and checks: every visible colour traceable to the theme, no traffic lights, wallpaper visible and blurred, logo in accent, filename in the title bar, line numbers present, PNG at 2×. Node tests validate fixture shape.
