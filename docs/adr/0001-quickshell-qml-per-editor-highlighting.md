---
number: 0001
title: Stack — quickshell QML, per-editor highlighters, primary-selection input
status: accepted
date: 2026-09-05
---

# ADR-0001: Stack — quickshell QML, per-editor highlighters, primary-selection input

## Status

accepted

## Context

Omasnap must produce an image that (a) colours code exactly as the editor it
was snapped from does under the current Omarchy theme, (b) frames it in a way
that is unmistakably Omarchy, (c) works from any editor without an extension,
and (d) runs on a stock Omarchy install with pacman-installable dependencies
only. It also needs a preview window in v1.

Options considered:

- **Renderer.** quickshell/QML (as the Pacman plugin); GTK4 + WebKitGTK with
  HTML/CSS (as the Sous plugin); headless Chromium rendering HTML to PNG (how
  codesnap and carbon work); GTK4 with Cairo/Pango. Headless Chromium has the
  best CSS fidelity but is a heavy dependency with no natural preview window.
  WebKitGTK adds a large runtime dependency. Cairo/Pango is native but every
  pretty effect is hand-drawn.
- **Highlighter.** One engine for both editors (shiki/TextMate, or tree-sitter)
  mapped to each theme, versus each editor's own mechanism. Zed colours
  tree-sitter captures from its theme's `syntax` map; VS Code colours TextMate
  scopes from `tokenColors`. A single engine is exact for one editor and
  approximate for the other.
- **Input.** A Zed task passing `$ZED_SELECTED_TEXT`; clipboard only; or the
  Wayland primary selection. The task route ties Omasnap to Zed and needs
  per-editor setup. The clipboard needs a copy step and loses context.

## Decision

- **quickshell/QML renders** both the preview window and the final image
  (`grabToImage`). Pure JavaScript in `lib/` (ES modules, `node --test`) does
  tokenising, theme parsing, layout decisions and language detection; QML only
  draws. This is the Pacman architecture and keeps logic testable without Qt.
- **Per-editor highlighting behind one token-span interface.** Zed: tree-sitter
  with Zed's highlight queries, coloured from the Zed Omarchy theme's `syntax`
  map. VS Code: TextMate grammars via shiki, coloured from the VS Code Omarchy
  theme's `tokenColors`. Any other focused app: a generic highlight coloured
  from `colors.toml`. Grammars and JS libraries are vendored into the repo.
- **Input via the Wayland primary selection**, read with `wl-paste --primary`,
  clipboard fallback when it is empty. The focused editor is identified with
  `hyprctl activewindow` (class and title); the filename in the title drives
  language detection, with a content-based guess and a manual override in the
  preview as fallbacks.
- **Colours only from the current theme directory**
  (`~/.local/state/omarchy/current/theme/`), read on every snap so theme
  switches are picked up live.
- **Distributed as an Omarchy plugin** (`manifest.json`, `bin/omasnap`,
  `bin/install`).

## Consequences

- Easier: preview window and PNG export come from the same QML scene; logic is
  unit-tested with Node; no browser or WebKit dependency; the look is driven by
  the same theme files Omarchy already generates for Zed and VS Code.
- Harder: two highlighting engines to vendor and keep in step (tree-sitter WASM
  or native builds, TextMate grammars); CSS-grade effects (blur, layered
  shadows) must be reproduced in QML; QML rich-text rendering must match the
  editor's font metrics closely enough to look right.
- Committed to: verifying early that Zed and VS Code publish selections to the
  Wayland primary selection and that window titles carry the filename (spike
  before the first Zed build); keeping every colour theme-sourced.
