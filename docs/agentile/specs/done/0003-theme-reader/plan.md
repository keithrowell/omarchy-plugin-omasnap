# Plan — Theme reader: parse the current Omarchy theme and editor settings into one colour model

Written by the plan stage. The build stage follows what it says. Pure ES
modules in `lib/`, no Qt, no dependencies, `node --test` suites, fixtures
copied from real themes. The Pacman plugin's `lib/theme.mjs`
(`/home/keith/Dropbox (Maestral)/lab/omarchy_pacman/lib/theme.mjs`) is a
good model for the `colors.toml` parser's style (comment stripping, unquote,
never-throw on junk) — but this spec **throws** on a malformed line, so do not
copy its silent-ignore behaviour, and do not copy its `DEFAULTS` palette:
Omasnap has no fallback colours at all.

## Files to touch

| File | Why |
|---|---|
| `lib/theme.mjs` | `readTheme(dir)`, `parseColors(text)`, `zedSyntaxStyle(zed, capture)`, `vscodeScopeStyle(vscode, scopes)`, `parseFontStyle(text)`. |
| `lib/editors.mjs` | `readEditorFont(editor, opts)`, `stripJsonc(text)` (exported for tests). |
| `tests/theme.test.mjs`, `tests/editors.test.mjs` | Behaviour tests against the fixtures. |
| `tests/fixtures/themes/gruvbox-dark/…` | The live theme, copied verbatim. |
| `tests/fixtures/themes/flexoki-light/…` | A contrasting light theme, rendered from Omarchy's templates (see below). |
| `tests/fixtures/themes/README.md` | Provenance: where each file came from and the exact command to regenerate. |
| `tests/fixtures/editors/{zed,vscode,zed-broken}/…` | Editor settings fixtures for `readEditorFont`. |

Nothing in `app/`, `bin/`, `README.md` changes. (`README.md` may gain one
sentence under "Where the colours come from" only if the builder finds the
existing text wrong.)

## Environment facts (verified at plan time, 2026-09-05)

- Live state layout: `~/.local/state/omarchy/current/` contains `theme/`
  (a directory, not a symlink, replaced on theme switch), `theme.name`
  (e.g. `gruvbox-dark`), and `background` (a symlink to a file under
  `theme/backgrounds/`). Inside `theme/`: `colors.toml`, `zed-theme.json`,
  `vscode.json` (a 2-key descriptor `{ name, extension }` — not the theme),
  `vscode-theme.json` (the generated VS Code theme), `backgrounds/`, plus
  many other app configs we ignore.
- `zed-theme.json` shape: `{ $schema, name, author, themes: [ { name,
  appearance: "dark"|"light", style: { ...flat dotted keys..., players: [
  { cursor, background, selection } ], syntax: { <capture>: { color,
  font_style, font_weight } } } } ] }`. Style keys of interest:
  `editor.background`, `editor.foreground`, `editor.gutter.background`,
  `editor.line_number`, `editor.active_line_number`,
  `editor.active_line.background`, `background`, `border`, `text`,
  `text.muted`, `text.accent`, `title_bar.background`, `tab_bar.background`,
  `terminal.background`. Selection colour is `players[0].selection`. 39
  syntax keys in the live theme, e.g. `punctuation.bracket`, `comment.doc`,
  `string.special.symbol`, `variable.special`, `emphasis.strong`.
  `font_style` is `null` or `"italic"`; `font_weight` is `null` or a
  number (700).
- The live `zed-theme.json` is produced at theme-set time either from the
  theme's own hand-written file or from
  `~/.config/omarchy/themed/zed-theme.json.tpl`; the hook
  `~/.config/omarchy/hooks/theme-set.d/zed-theme` then copies it to
  `~/.config/zed/themes/omarchy.json` with the name rewritten to "Omarchy".
  The two files differ only in the `name` fields, so the theme-dir file is
  the right source (it is what Zed displays).
- `vscode-theme.json` shape: `{ name: "Omarchy", type: "dark"|"light",
  semanticHighlighting, semanticTokenColors: {…}, colors: { ~664 keys },
  tokenColors: [ { name, scope: string | string[], settings: { foreground?,
  fontStyle? } } × 81 ] }`. Rendered from
  `~/.local/share/omarchy/default/themed/vscode-theme.json.tpl`.
- **Rendering a second theme without touching the live desktop** (verified):
  `omarchy-theme-set-templates` renders `$OMARCHY_PATH/default/themed/*.tpl`
  and `$HOME/.config/omarchy/themed/*.tpl` from
  `$HOME/.local/state/omarchy/current/next-theme/colors.toml` into that same
  `next-theme` directory. With a fake `HOME` it is side-effect free:

  ```bash
  O=~/.local/share/omarchy
  FH=<scratch>/render-flexoki-light            # a fresh, empty directory
  mkdir -p "$FH/.local/state/omarchy/current/next-theme" "$FH/.config/omarchy/themed"
  cp ~/.config/omarchy/themed/zed-theme.json.tpl "$FH/.config/omarchy/themed/"
  cp "$O/themes/flexoki-light/colors.toml" "$FH/.local/state/omarchy/current/next-theme/"
  HOME="$FH" OMARCHY_PATH="$O" bash "$O/bin/omarchy-theme-set-templates"
  ls "$FH/.local/state/omarchy/current/next-theme"   # zed-theme.json, vscode-theme.json, colors.toml, …
  ```

  Use one fresh directory per render (two renders into one directory
  overwrite each other). `omarchy-theme-color` (on PATH at
  `/usr/share/omarchy/bin`) reports `mode light` / `theme_type light` for
  flexoki-light, so the render is a genuine light theme (`appearance:
  "light"`, `type: "light"`, `editor.background` near `#FFFCF0`).
- Zed settings: `~/.config/zed/settings.json` is JSONC with `//` comments
  and **URLs inside strings** (`"https://mcp.atlassian.com/…"`). A naive
  `//`-to-end-of-line strip corrupts it (verified: JSON.parse then fails
  with "Bad control character"). The stripper must be string-aware. Live
  values: `"buffer_font_size": 13`, `"buffer_font_family": "FiraCode Nerd
  Font"` (top level, lines 245–246). VS Code settings
  (`~/.config/Code/User/settings.json`) do not exist on this machine.
- `fc-match --format '%{family}' monospace` prints
  `JetBrainsMono Nerd Font,JetBrainsMono NF` (comma-separated aliases; take
  the first).

## Approach

### `lib/theme.mjs`

```js
export const DEFAULT_THEME_DIR = join(homedir(), ".local/state/omarchy/current/theme");
export function readTheme(dir = DEFAULT_THEME_DIR) → { name, mode, colors, zed, vscode, wallpaper, dir }
export function parseColors(text) → { [key]: string }          // throws on a malformed line
export function zedSyntaxStyle(zed, capture) → { color, fontStyle, fontWeight }
export function vscodeScopeStyle(vscode, scopes) → { color, fontStyle, fontWeight, underline }
export function parseFontStyle(text) → { fontStyle, fontWeight, underline }   // "italic bold underline"
```

- **`readTheme`** reads, every call, with no module-level cache:
  - `colors` = `parseColors(read(dir/colors.toml))`; missing file → throw
    (`colors.toml` is the one file that must exist).
  - `mode` = `colors.mode` if `"light"` or `"dark"`, else `"dark"`.
  - `name` = trimmed contents of `<parent of dir>/theme.name` if that file
    exists, else `basename(realpath(dir))`.
  - `wallpaper` = `realpath(<parent of dir>/background)` when it exists
    (follow the symlink; `null` if absent or dangling).
  - `zed` = `null` if `dir/zed-theme.json` is absent; otherwise parse and
    pick `themes[i]` whose `appearance === mode`, else `themes[0]`; return
    `{ name, appearance, style, syntax, raw }` where `style` is a **flat
    camelCase subset** with stable names the renderer will use:
    `editorBackground`, `editorForeground`, `gutterBackground`,
    `lineNumber`, `lineNumberActive`, `activeLineBackground`,
    `selectionBackground` (from `players[0].selection`, falling back to
    `style["element.selected"]`), `background`, `border`, `text`,
    `textMuted`, `accent` (`text.accent`), `titleBarBackground`,
    `tabBarBackground`, `terminalBackground`; `raw` is the untouched
    `style` object so nothing is lost; `syntax` maps each capture to
    `{ color, fontStyle, fontWeight }` (renamed from `font_style` /
    `font_weight`, `null` preserved).
  - `vscode` = `null` if `dir/vscode-theme.json` is absent; otherwise
    `{ name, type, colors, tokenColors, semanticTokenColors }` passed
    through (normalise each rule's `scope` to an array of trimmed
    selectors, splitting comma-separated strings).
  - Also read `dir/vscode.json` (the descriptor) into `vscode.descriptor`
    (`{ name, extension }` or `null`) — cheap, and spec 0006 may want to
    know a third-party theme is selected.
- **`parseColors`**: strip a trailing `#` comment outside quotes, skip blank
  lines, accept `key = "value"` / `key = 'value'` / bare values; any other
  non-blank line throws `Error("colors.toml line N: <text>")`. Returns
  strings. (No validation of hex here — the theme is trusted.)
- **`zedSyntaxStyle(zed, capture)`**: throws `Error("no Zed theme loaded")`
  if `zed` is null. Try `capture`, then drop the last dotted segment
  repeatedly (`a.b.c` → `a.b` → `a`); the first key present wins. Return
  `{ color: entry.color ?? editorForeground, fontStyle: entry.fontStyle ??
  null, fontWeight: entry.fontWeight ?? null }`; no match at all →
  `{ color: editorForeground, fontStyle: null, fontWeight: null }`.
- **`vscodeScopeStyle(vscode, scopes)`**: throws if `vscode` is null.
  `scopes` is the token's scope stack, outermost first (e.g.
  `["source.js", "meta.function.js", "entity.name.function.js"]`). Rule set,
  documented in the module header:
  1. A rule's selector is a string; commas were already split into separate
     selectors. A selector is space-separated *components*
     (`string constant.other.placeholder`). Selectors starting with `-`
     (exclusion) are ignored, as are selectors containing `|`, `(`, `>`
     (the Omarchy templates use none of these).
  2. A component matches a scope when it equals the scope or is a
     dot-boundary prefix of it (`entity.name` matches
     `entity.name.function.js`, not `entity.names`).
  3. A selector matches the stack when its **last** component matches some
     scope at stack index `i`, and each earlier component matches some
     earlier scope, in order (descendant matching).
  4. Specificity of a match = `(i, segmentsMatched, ruleIndex)` — deeper
     stack position wins, then longer component match, then later rule
     wins ties (VS Code's "later rules override"). Evaluate independently
     for `foreground` and for `fontStyle`: the best matching rule that
     *sets* `foreground` gives the colour; the best that *sets* `fontStyle`
     gives the style (an explicit `""` fontStyle resets to none).
  5. No foreground from any rule → `colors["editor.foreground"]`.
  Result `{ color, fontStyle: "italic"|null, fontWeight: 700|null,
  underline: boolean }` via `parseFontStyle`.
- No hex literal anywhere in this module; the only colour-shaped text is
  the comment-stripping/quote logic, which is not hex-shaped.

### `lib/editors.mjs`

```js
export function stripJsonc(text) → string       // string-aware: // and /* */ outside strings, trailing commas before } or ]
export function readEditorFont(editor, { home = homedir(), fcMatch } = {}) → { family, size, source }
```

- `editor` is `"zed"`, `"vscode"`, or anything else (→ system font).
- Zed: `<home>/.config/zed/settings.json`. Try `JSON.parse(stripJsonc(text))`
  and read top-level `buffer_font_family` / `buffer_font_size`. If parsing
  still fails (a hand-edited file can be broken in other ways), fall back to
  a regex scan for `"buffer_font_family"\s*:\s*"([^"]*)"` and
  `"buffer_font_size"\s*:\s*([0-9.]+)`. Either key missing → that half
  falls back to the system value; `source` is `"zed"` if at least one key
  came from the file.
- VS Code: `<home>/.config/Code/User/settings.json`, keys `editor.fontFamily`
  (take the first comma-separated family, strip surrounding quotes) and
  `editor.fontSize`; same fallbacks; `source: "vscode"`.
- System: `fcMatch` defaults to a function that runs
  `execFileSync("fc-match", ["--format", "%{family}", "monospace"])` (no
  shell) and returns the first comma-separated family; if `fc-match` is
  missing or fails → `"monospace"`. Size 13. `source: "system"`.
- Missing settings file → system font silently. Never throws.

### Fixtures

`tests/fixtures/themes/<name>/` mirrors the `current/` layout so
`readTheme("<fixture>/theme")` exercises name and wallpaper resolution:

```
tests/fixtures/themes/gruvbox-dark/
  theme.name                      # "gruvbox-dark"
  background -> theme/backgrounds/omarchy.webp   # relative symlink (git stores it)
  theme/colors.toml               # copied from the live theme dir
  theme/zed-theme.json            # copied (name "Gruvbox Dark (Omarchy)")
  theme/vscode.json               # copied (descriptor)
  theme/vscode-theme.json         # copied
  theme/backgrounds/omarchy.webp  # copied (716 bytes)
tests/fixtures/themes/flexoki-light/
  theme.name                      # "flexoki-light"
  background -> theme/backgrounds/omarchy.webp
  theme/colors.toml               # copied from ~/.local/share/omarchy/themes/flexoki-light/
  theme/vscode.json               # copied from the same place
  theme/zed-theme.json            # rendered via the fake-HOME command above
  theme/vscode-theme.json         # rendered likewise
  theme/backgrounds/omarchy.webp  # the same tiny file
tests/fixtures/themes/README.md   # provenance + regeneration commands, Omarchy 4.0.0.alpha, date
tests/fixtures/editors/zed/.config/zed/settings.json        # JSONC: comments, trailing commas, a URL in a string, the two font keys
tests/fixtures/editors/vscode/.config/Code/User/settings.json  # editor.fontFamily with a quoted comma list, editor.fontSize
tests/fixtures/editors/zed-broken/.config/zed/settings.json # unparseable even after stripping, but the two keys are greppable
```

Do **not** copy the whole live `theme/` directory (hyprlock, kitty, etc.);
only the files listed. Do not commit large backgrounds.

### Tests

`tests/theme.test.mjs` (assert on real values read from the fixtures —
hex literals are fine in `tests/`):

- `parseColors`: every key from the live `colors.toml` present for both
  fixtures; `mode` light vs dark; comment and quote handling on an inline
  string; a malformed line throws mentioning its line number.
- `readTheme(gruvbox)`: `name === "gruvbox-dark"`, `mode === "dark"`,
  `zed.appearance === "dark"`, `zed.style.editorBackground ===
  zed.raw["editor.background"]`, `zed.style.selectionBackground ===
  raw.players[0].selection`, `zed.syntax.comment.fontStyle === "italic"`,
  `vscode.type === "dark"`, `vscode.tokenColors[0].scope` is an array,
  `wallpaper` ends with `theme/backgrounds/omarchy.webp` and is absolute.
- `readTheme(flexoki)`: `mode === "light"`, `zed.appearance === "light"`,
  `vscode.type === "light"`, colours differ from gruvbox.
- `zedSyntaxStyle`: exact (`punctuation.bracket`), fallback
  (`function.method` → `function`, `punctuation.bracket.x` →
  `punctuation.bracket`), none (`zzz.yyy` → editor foreground, nulls),
  `zed === null` throws.
- `vscodeScopeStyle`: `["source.js","comment.line.js"]` → the Comment rule's
  colour and `fontStyle: "italic"`; `["source.js","variable.parameter.js"]`
  beats plain `variable`; the descendant selector `string
  constant.other.placeholder` matches `["source.js","string.quoted.js",
  "constant.other.placeholder.js"]` but not
  `["source.js","constant.other.placeholder.js"]`; unknown scope → editor
  foreground; `vscode === null` throws.
- Multi-theme Zed file: write a temp `zed-theme.json` with two entries
  (light first, dark second) beside a dark `colors.toml` → the dark one is
  picked; with no appearance match → first.
- Missing `zed-theme.json` / `vscode-theme.json` → `null`, other keys fine.
- Missing `background` → `wallpaper === null`; missing `theme.name` →
  basename.
- No caching: copy a fixture to a temp dir, `readTheme` it, rewrite
  `colors.toml` with a different `accent`, `readTheme` again → new value.

`tests/editors.test.mjs`:

- `stripJsonc`: comments, block comments, trailing commas, `//` inside a
  string survives, escaped quotes inside strings.
- `readEditorFont("zed", { home: fixture })` → `{ family: "FiraCode Nerd
  Font", size: 13, source: "zed" }`; `("vscode", …)` → first family
  unquoted, numeric size; `zed-broken` → values via the regex fallback;
  missing home → `source: "system"` with an injected `fcMatch` returning
  `"Foo Mono"` → `{ family: "Foo Mono", size: 13 }`; injected `fcMatch`
  throwing → `"monospace"`; `readEditorFont("other")` → system.

## Test strategy

- Gate `test`: `node --test tests/*.test.mjs` (18 existing + the new suites).
- Verify rule 3: `grep -rnE '#[0-9a-fA-F]{6}' app lib` → nothing.
- Verify rule 4: `grep -rn 'import Qt\|Qt\.' lib` → nothing.
- Live check (the reviewer runs it; the builder should too and paste the
  trimmed output):
  `node -e 'import("./lib/theme.mjs").then(m=>{const t=m.readTheme();console.log(t.name,t.mode,t.zed.style.editorBackground,t.vscode.type,t.wallpaper,Object.keys(t.zed.syntax).length)})'`
  and
  `node -e 'import("./lib/editors.mjs").then(m=>console.log(m.readEditorFont("zed"),m.readEditorFont("vscode")))'`.
- Deploy gate `bin/install` at ship (unchanged behaviour).

## Risks and unknowns

- **Zed `players`/selection**: if a hand-written theme lacks `players`,
  `selectionBackground` falls back to `element.selected`, then `null`; the
  renderer (spec 0004) must tolerate `null` there.
- **Scope matching fidelity** for VS Code is a documented approximation of
  VS Code's algorithm; spec 0005/VS Code work can refine it. Keep the rules
  in one place and unit-tested so refinement is safe.
- **Symlinked `background` in git**: commit the fixture symlink as a
  relative link (`ln -s theme/backgrounds/omarchy.webp background`); git
  stores symlinks fine, and `realpath` resolves it in tests. If Dropbox
  sync mangles symlinks on another machine, the test's `wallpaper` assertion
  will tell us; `readTheme` itself must not care.
- **JSONC edge cases** beyond comments and trailing commas (e.g. a stray
  control character) are why the regex fallback exists; it is deliberately
  narrow (two keys).
- **`fc-match` absent** in a test or CI environment: the injected `fcMatch`
  keeps the suite hermetic; the default path is exercised only by the live
  check.

## ADR

none — implements ADR-0001's "colours only from the current theme directory".
