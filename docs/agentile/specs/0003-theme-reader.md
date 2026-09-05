---
title: Theme reader — parse the current Omarchy theme and editor settings into one colour model
slug: theme-reader
status: ready
depends_on: []
type: feature
route: background
business_value: high
technical_certainty: high
created: 2026-09-05
outcome: node --test passes with fixtures for two themes, and readTheme() returns the live theme's colours, Zed syntax map, VS Code tokenColors, wallpaper path and editor font with no hard-coded colours anywhere in lib/
claimed_by:
label:
claimed_at:
---

# Theme reader — parse the current Omarchy theme and editor settings into one colour model

## Problem / why now

Every colour in Omasnap must come from the current theme, and every later spec
(highlighter, frame, preview) consumes it. One tested module that turns the
theme directory into a plain object is the foundation, and it has no unknowns.

## Acceptance criteria

- [ ] `lib/theme.mjs` exports `readTheme(dir = ~/.local/state/omarchy/current/theme)` returning `{ name, mode, colors, zed, vscode, wallpaper }`.
- [ ] `colors` is `colors.toml` parsed (all keys: accent, selection, muted, background ladder, foreground ladder, the 8 colours and brights) — a minimal TOML parser for flat `key = "value"` lines is fine, no dependency.
- [ ] `zed` is from `zed-theme.json`: `{ appearance, style: { editorBackground, editorForeground, gutterBackground, lineNumber, lineNumberActive, selectionBackground, ... }, syntax: { <capture>: { color, fontStyle, fontWeight } } }`, with a helper `zedSyntaxStyle(zed, capture)` that applies Zed's fallback (try `a.b.c`, then `a.b`, then `a`, then editor foreground).
- [ ] `vscode` is from `vscode-theme.json`: `{ colors, tokenColors, semanticTokenColors }` passed through, plus a helper `vscodeScopeStyle(vscode, scopes[])` that resolves a TextMate scope list to a style using longest-matching-prefix rules (the exact rule set is documented in the module).
- [ ] `wallpaper` is the resolved path of `~/.local/state/omarchy/current/background` (null if absent).
- [ ] `lib/editors.mjs` exports `readEditorFont(editor)` returning `{ family, size }` from `~/.config/zed/settings.json` (`buffer_font_family`, `buffer_font_size`; the file may contain comments and trailing commas, so strip them before parsing) or `~/.config/Code/User/settings.json` (`editor.fontFamily`, `editor.fontSize`), falling back to the system monospace font (`fc-match monospace`) at 13.
- [ ] Nothing is cached across calls; each `readTheme()` re-reads the files.
- [ ] Tests in `tests/theme.test.mjs` and `tests/editors.test.mjs` use fixtures under `tests/fixtures/themes/<name>/` copied from two real Omarchy themes (the current one and one contrasting light or dark theme), and assert on real values.
- [ ] `grep -rnE '#[0-9a-fA-F]{6}' lib` returns nothing.

## Scope boundary

**In scope:** reading and normalising; the two style-resolution helpers.

**Out of scope:** tokenising code; anything QML; watching for theme changes (each snap re-reads).

## Edge cases and failure paths

- Missing `zed-theme.json` or `vscode-theme.json`: the corresponding key is null and a clear error is thrown only by the helpers that need it.
- Malformed `colors.toml`: throw with the offending line.
- Zed theme file with more than one entry in `themes`: pick the one whose `appearance` matches `mode`, else the first.
- Missing editor settings file: fall back silently to the system font.

## Affected areas

`lib/theme.mjs`, `lib/editors.mjs`, `tests/theme.test.mjs`, `tests/editors.test.mjs`, `tests/fixtures/themes/`.

## Open questions

None.

## Verification

`node --test tests/*.test.mjs`; the reviewer runs `node -e 'import("./lib/theme.mjs").then(m=>console.log(m.readTheme()))'` against the live theme.
