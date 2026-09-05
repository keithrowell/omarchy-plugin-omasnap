# Omasnap

Turn selected code into a beautiful, unmistakably Omarchy image for a social
post, a doc, or a chat — like codesnap.dev without the macOS traffic lights,
wearing the live Omarchy theme, and coloured exactly the way the editor it
was snapped from shows the code. It is a standalone Quickshell app
(`qs -p app/Main.qml`), started by a Hyprland keybinding, not an editor
extension.

![Omasnap preview](preview.png)

## Usage

Select some code in Zed (or anywhere else — see "Editors" below), press
**`SUPER + ALT + SHIFT + S`**. Within about a second a floating "Omasnap"
window appears, showing the selection framed exactly as the active editor
colours it, under the current Omarchy theme:

- **Enter** (or the **Copy** button) puts the rendered PNG on the clipboard
  (`image/png`) — paste it anywhere that accepts an image.
- **S** (or **Save**) writes it to `$(xdg-user-dir PICTURES)` (usually
  `~/Pictures`) as `omasnap-YYYY-MM-DD_HH-MM-SS.png`. Both actions leave the
  window open, so you can do both, or try a different language first.
- The language selector (bottom-left) shows what was detected from the
  filename or a `#!` shebang; pick a different one (or "plain", for no
  highlighting) to re-highlight without re-selecting anything.
- **Esc** (or **Close**) closes the window. Pressing the binding again while
  a preview is open doesn't close it — it replaces it with a fresh snap of
  whatever is selected then (or notifies "Nothing selected" if nothing is).

Selections over 200 lines are truncated (with a warning shown in the bar);
everything is read fresh from `wl-paste --primary` (falling back to the
clipboard) and the live Omarchy theme on every press — nothing is cached
between snaps.

### Editors

Zed is colour-exact (tree-sitter + Zed's own `highlights.scm`, see below).
Anywhere else — a terminal, a browser, another editor — still snaps,
highlighted the same way, with the language detected from a shebang line
when there's no filename to go on; VS Code's own exact colouring is a
later spec.

## Install

Either clone this repo straight into the plugin directory:

```bash
git clone <this-repo> ~/.config/omarchy/plugins/com.keithrowell.omasnap
~/.config/omarchy/plugins/com.keithrowell.omasnap/bin/install
```

or keep a checkout elsewhere (a development clone, or this repo as a
submodule of the dotfiles the way the other `com.keithrowell.*` plugins are)
and let `bin/install` symlink it into place:

```bash
bin/install
```

`bin/install` is idempotent (`--dry-run` shows what it would do without
touching anything; `--uninstall` reverses it; running it again reports
`unchanged`). It:

- links `~/.config/omarchy/plugins/com.keithrowell.omasnap` to this checkout,
  when nothing is already there;
- writes `~/.local/share/applications/Omasnap.desktop`, so the app launcher
  lists Omasnap;
- links `~/.local/bin/omasnap` to `bin/omasnap` when `~/.local/bin` exists,
  so the app can be started from a terminal;
- checks the required packages below are installed and reports any missing
  ones (it never fails the install over a missing package);
- compiles the vendored Zed-highlighting grammars (`bin/build-grammars`,
  below) and reports what it built, without failing the install if that
  step has a problem;
- prints, but never applies, the Hyprland binding below.

## Binding

`bin/install` prints this block for `~/.config/hypr/bindings.lua`; paste it
in by hand:

```lua
-- Omasnap: snap the selected code into an Omarchy-styled image.
o.bind("SUPER + ALT + SHIFT + S", "Omasnap", "~/.config/omarchy/plugins/com.keithrowell.omasnap/bin/omasnap")
o.window({ title = "^(Omasnap)$" }, { float = true, center = true })
```

## Required packages

```
sudo pacman -S --needed quickshell wl-clipboard qt6-5compat tree-sitter-cli gcc nodejs
```

`bin/install` reads this exact line and reports anything from it that is not
installed, with the command to install it.

## Zed-exact highlighting and the grammar build step

Zed's own highlighting rules — its tree-sitter grammars and `highlights.scm`
queries, at the versions Zed itself pins — are vendored under `vendor/`
rather than taken from pacman's `tree-sitter-grammars` packages, so the
colours are exactly Zed's regardless of what grammar versions Arch happens
to package (see `docs/adr/0002-grammar-sourcing.md`). `bin/install` runs
`bin/build-grammars`, which compiles each `vendor/grammars/<name>/` source
tree into `vendor/grammars/lib/<name>.so` with the `tree-sitter` CLI
(idempotent — a second run reports `unchanged`; `bin/build-grammars --check`
reports what's missing without building). The first install compiles every
grammar, which takes well under a minute on a typical machine even for the
larger TypeScript/TSX grammars; later installs are near-instant. Re-run
`tools/vendor-grammars.sh` (network, dev-time only) to bump a grammar or
query pin.

**Supported languages:** JavaScript/JSX, TypeScript, TSX, Python, Rust, C,
Bash, JSON(C), YAML, Markdown (block-level only — see below), Ruby, Lua.
Anything else falls back to one plain span per line in the theme's editor
foreground, never an error. Markdown is highlighted with Zed's own *block*
grammar only: headings, list markers and fenced-code delimiters colour; a
fenced code block's contents and inline emphasis (no injections in this
build) render as plain text. Zed's semantic (LSP) highlighting, layered on
top of tree-sitter in the real editor, is not reproduced.

## Where the colours come from

Every colour comes from `~/.local/state/omarchy/current/theme/`:
`colors.toml` for the frame and chrome, `zed-theme.json` for Zed's syntax
colours, `vscode-theme.json` for VS Code's. The theme is read fresh on every
snap, so switching the Omarchy theme changes the very next image with no
restart. Nothing is ever hard-coded.

## Non-goals

- No editor plugins or extensions — Omasnap never asks Zed or VS Code to do anything.
- No non-Omarchy styling: no theme picker, no macOS/Windows chrome, no arbitrary colour schemes.
- No direct posting to social networks; it produces an image, sharing is yours.
- No editing or annotation UI: no arrows, highlights, or captions on the image.

## Development

```bash
bin/omasnap                        # run from the checkout: snap the current selection and preview it
bin/omasnap --benchmark            # time the non-window steps of a live snap (no window opens)
node --test tests/*.test.mjs       # every test in the project
bin/build-grammars                 # compile vendored grammars (first run only; node --test does this too)
bin/build-grammars --check         # report what's missing/stale without building
```

`bin/omasnap --fixture F --out P` renders a fixture (a JSON file shaped like
`tests/fixtures/render/*.json`: filename, language, editor, font and
highlighted lines) straight to a PNG, headlessly, with no selection or editor
involved — the same frame (`app/Snap.qml`) the real snap window uses, so it's
how builders and reviewers check the look without a live selection. It reads
the current Omarchy theme by default; `--theme-dir` and `--wallpaper`
override which theme and wallpaper it renders against, for comparing themes
side by side.

`OMASNAP_AUTO=copy|save|shot|none bin/omasnap` drives the live preview
window unattended (used to test Copy/Save without a human, or to grab a
picture of the bar itself with `shot`) — the same environment variable
Pacman's `PACMAN_DEBUG_KEYS` plays a similar role for.

`docs/agentile/` and `docs/adr/` carry the backlog and the decision records
this project is built from (see `CLAUDE.md`).

## Licence

MIT (see `LICENSE`).
