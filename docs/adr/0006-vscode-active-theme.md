---
number: 0006
title: Colour VS Code snaps from its actual active theme, not Omarchy's vscode-theme.json
status: accepted
date: 2026-09-07
---

# ADR-0006: Colour VS Code snaps from its actual active theme, not Omarchy's vscode-theme.json

## Status

accepted

## Context

`docs/adr/0005-vscode-grammar-sourcing.md` covered reading grammars from
the installed VS Code. Colour resolution still assumed something narrower:
that VS Code's `workbench.colorTheme` was actually set to "Omarchy" (the
theme Omarchy installs and keeps in sync with the live desktop theme), so
`highlight/vscode.mjs` always coloured from `theme.vscode` — Omarchy's own
`vscode-theme.json` — regardless of what VS Code itself was configured to
use.

That assumption broke twice in the same session, on the reference machine:

1. `workbench.colorTheme` was `"Gruvbox Dark Medium"` — a real, standing
   preference (the `jdinhlife.gruvbox` extension's own bundled variant),
   never changed to `"Omarchy"` in the first place.
2. After manually switching to `"Omarchy"`, browsing VS Code's theme
   picker (arrow-key live-previewing, without confirming a pick) left
   `workbench.colorTheme` on `"Ocean Green: Dark"` — a third, unrelated
   extension's theme, close enough in hue to the desktop's Osaka Jade theme
   to look plausible at a glance.

In both cases Omasnap was reading Omarchy's theme file correctly and
resolving scopes correctly (verified directly, scope-by-scope, against the
real Ruby grammar's tokenizeLine output) — the bug was assuming that file
described what VS Code was rendering, when a user is free to point VS Code
at any installed theme at any time, same as the font: `lib/fonts.mjs`
already reads the *editor's own* configured font rather than assuming one,
and colour should get the same treatment.

## Decision

`lib/vscode-extensions.mjs` gains a second discovery capability alongside
grammar resolution — resolving VS Code's real active theme:

- `readVscodeColorThemeSetting()` reads `workbench.colorTheme` straight out
  of `~/.config/Code/User/settings.json` (JSONC, via the same `stripJsonc`
  `lib/fonts.mjs` already uses).
- `buildThemeIndex()` scans the same extension roots grammar discovery
  already scans (built-in `resources/app/extensions`, user
  `~/.vscode/extensions`) for every `contributes.themes` entry, indexed by
  `label` — resolving a built-in theme's NLS-wrapped label
  (`%darkModernThemeLabel%`) via the extension's own `package.nls.json`,
  since VS Code's own bundled themes ("Dark Modern", "Dark+", ...) all do
  this and third-party ones almost never do.
- `loadVscodeThemeFile()` follows a theme's `include` chain — VS Code's own
  bundled themes lean on this heavily (`Dark Modern` → `Dark+` → `Visual
  Studio Dark`) — merging `colors`/`semanticTokenColors` (includer wins)
  and concatenating `tokenColors` base-then-includer (so `vscodeScopeStyle`'s
  existing "later rule wins a tie" behaviour still lets an includer's
  override take precedence).
- `resolveActiveVscodeTheme()` composes the above into one normalised theme
  (`lib/theme.mjs`'s `normalizeVscodeTheme`, extracted from `readVscodeTheme`
  so both call sites share the same rules) — falling back to VS Code's own
  real out-of-the-box default label, `"Dark Modern"`, when nothing is
  configured, matching what a vanilla install actually shows.

`lib/highlight/vscode.mjs`'s `highlight()` now resolves this active theme
first, falling back to `theme.vscode` (Omarchy's file) only when the active
theme can't be resolved at all (a broken or uninstalled theme reference) —
verified end-to-end against the reference machine's real, current
`"Gruvbox Dark Medium"`: `resolveActiveVscodeTheme()` returns its real
`keyword: #fb4934`, and a fresh render shows that exact red, matching the
real editor on screen at that moment.

## Addendum: JSONC theme files (found live, fixed same day)

Shipped without noticing `lib/vscode-extensions.mjs`'s `readJson()` used a
plain `JSON.parse` — fine for `package.json`/`package.nls.json`, but a real
installed theme (`jovejonovski.ocean-green`) has `// #region ...` line
comments in its actual theme JSON, which VS Code's own loader tolerates.
`JSON.parse` threw, the catch swallowed it to `null`, and
`resolveActiveVscodeTheme()` returned a *hollow* theme (zero `tokenColors`,
no `editor.foreground`) instead of failing outright — every span's colour
then resolved to `null`, which `validateFixture` rejects, crashing the
entire snap ("lines[0][0].color: must be a string") instead of degrading.
Two fixes, both load-bearing: `readJson()` now strips JSONC
(comments/trailing commas) before parsing, like every other settings/theme
read in this codebase already does; and `resolveActiveVscodeTheme()` now
explicitly checks the loaded theme has *something* usable
(`tokenColors.length > 0` or a real `editor.foreground`) and returns `null`
— triggering the proper Omarchy-file fallback — rather than a theme that
looks resolved but colours nothing. Caught live, on the reference machine's
actual installed theme, not by any test written before shipping ADR-0006.

## Consequences

- Easier: Omasnap now genuinely satisfies "coloured exactly the way the
  editor it was snapped from shows it" for VS Code, independent of whether
  the user ever pointed it at Omarchy's own theme — the same standard Zed
  already meets. A user's standing theme preference, or a
  moment's live-preview browsing left uncommitted, both resolve correctly
  with no special-casing.
- Harder: two extension-tree scans now run per VS Code highlight
  (grammars, themes) instead of one; both are already fast (tens of
  milliseconds on the reference machine) and neither is cached, matching
  every other theme/settings read in this codebase (always live, so a
  theme switch between snaps is picked up with no restart).
- Omarchy's own `vscode-theme.json` is not made redundant: it's still the
  fallback when VS Code's configured theme can't be resolved, and it's
  still what the "Omarchy" theme entry itself *is* when a user does choose
  it.
- Reversible: `resolveActiveVscodeTheme()` returning `null` unconditionally
  would restore the prior "always use Omarchy's file" behaviour with a
  one-line change in `lib/highlight/vscode.mjs`.
