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

## Amended 2026-09-05

Spike `0002-spike-selection-and-highlight-path` (`findings.md`) verified the
primary-selection input path and the tree-sitter + Zed-queries highlight
path on this machine (Zed 1.18.1, tree-sitter CLI 0.26.9). Status stays
**accepted**; both mechanisms this ADR commits to work as described, with
one correction to how the highlight path is implemented:

- **Zed does not highlight `.js` with `tree-sitter-javascript`.** Zed's own
  `crates/grammars/src/javascript/config.toml` sets `grammar = "tsx"` — Zed
  parses JavaScript with the TSX grammar from its own fork of
  `tree-sitter-typescript` (pinned in Zed's `Cargo.lock`, e.g. commit
  `e2c53597d6a5d9cf7bbe8dccde576fe1e46c5899` for `v1.18.1`). Zed's JavaScript
  `highlights.scm` uses node types (`nested_type_identifier`) that only
  exist in that TSX grammar; it fails to compile against plain
  `tree-sitter-javascript`. **Spec 0005 must vendor Zed's `tree-sitter-typescript`
  fork's `tsx` grammar for JavaScript, pinned to the commit Zed's own
  `Cargo.lock` pins at the target Zed version** — not the plain, more
  obvious `tree-sitter-javascript` grammar. Python is unaffected: Zed pins
  plain upstream `tree-sitter-python` (`0.25.0` at `v1.18.1`), which compiles
  and runs cleanly against Zed's Python `highlights.scm`.
- The tree-sitter CLI (0.26.9), driven directly via `--lib-path`/`--lang-name`
  against a vendored, prebuilt `.so`, compiles and runs both languages'
  `highlights.scm` correctly and comfortably within the ~200ms budget (median
  ~86ms for JS, ~47ms for Python on a 60-line fixture, process start
  included) — the Node/WASM binding is not needed. Every capture either
  language's query actually produces on ordinary source resolves onto the
  live Zed theme's `syntax` keys via exact match or Zed's documented
  dotted-prefix fallback.
- On the input side: `wl-paste --primary` reads Zed's selection exactly,
  publishes nothing to the clipboard, and fails predictably (exit 1,
  "Nothing is copied") when empty, as this ADR assumed. Zed's window class is
  `dev.zed.Zed`; its title format for a standalone file is `<file> — <file>`
  (parseable with `^([^—]+?) — `). One risk surfaced, not yet resolved: after
  firing an `exec`-style dispatch, `hyprctl activewindow -j` twice reported
  an unrelated transient window instead of Zed on this machine (the primary
  selection itself was unaffected) — spec 0006 should read `activewindow`
  defensively rather than trust the first read unconditionally.

See `findings.md` in the spike's spec directory for full evidence, commands,
and output.
