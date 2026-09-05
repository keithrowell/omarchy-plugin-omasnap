# Omasnap

Turn selected code into a beautiful, unmistakably Omarchy image for a social
post, a doc, or a chat — like codesnap.dev without the macOS traffic lights,
wearing the live Omarchy theme, and coloured exactly the way the editor it
was snapped from shows the code. It is a standalone Quickshell app
(`qs -p app/Main.qml`), started by a Hyprland keybinding, not an editor
extension.

![Omasnap preview](preview.png)

*(Screenshot lands with spec 0006, once the real snap window exists.)*

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
sudo pacman -S --needed quickshell wl-clipboard tree-sitter-cli tree-sitter-bash tree-sitter-c tree-sitter-javascript tree-sitter-lua tree-sitter-markdown tree-sitter-python tree-sitter-rust
```

`bin/install` reads this exact line and reports anything from it that is not
installed, with the command to install it.

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
bin/omasnap                        # run from the checkout
node --test tests/*.test.mjs       # installer and manifest tests
```

`docs/agentile/` and `docs/adr/` carry the backlog and the decision records
this project is built from (see `CLAUDE.md`).

## Licence

MIT (see `LICENSE`).
