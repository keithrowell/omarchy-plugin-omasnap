# Theme fixtures — provenance

Captured against `omarchy 4.0.1-2` on 2026-09-05. Both fixtures mirror the
`~/.local/state/omarchy/current/` layout (`theme.name`, `background` symlink,
`theme/`) so `readTheme("<fixture>/theme")` exercises name and wallpaper
resolution the same way it would against the live directory.

## `gruvbox-dark/` — the live theme, copied verbatim

The theme active on this machine at capture time. Every file under
`theme/` (`colors.toml`, `zed-theme.json`, `vscode.json`,
`vscode-theme.json`, `backgrounds/omarchy.webp`) is a straight copy from
`~/.local/state/omarchy/current/theme/`; `theme.name` is a copy of
`~/.local/state/omarchy/current/theme.name`. Regenerate with:

```bash
D=tests/fixtures/themes/gruvbox-dark
cat ~/.local/state/omarchy/current/theme.name > "$D/theme.name"
cp ~/.local/state/omarchy/current/theme/colors.toml "$D/theme/colors.toml"
cp ~/.local/state/omarchy/current/theme/zed-theme.json "$D/theme/zed-theme.json"
cp ~/.local/state/omarchy/current/theme/vscode.json "$D/theme/vscode.json"
cp ~/.local/state/omarchy/current/theme/vscode-theme.json "$D/theme/vscode-theme.json"
cp ~/.local/state/omarchy/current/theme/backgrounds/omarchy.webp "$D/theme/backgrounds/omarchy.webp"
ln -sf theme/backgrounds/omarchy.webp "$D/background"
```

(Only run this if the live theme actually changes to gruvbox-dark again —
otherwise pick a different contrasting pair and update this file.)

## `flexoki-light/` — a contrasting light theme, rendered without touching the live desktop

`flexoki-light` ships no hand-written `zed-theme.json`; Omarchy generates
both `zed-theme.json` and `vscode-theme.json` from templates at
theme-set time. To capture those two files without switching the live
theme, `omarchy-theme-set-templates` was run against a throwaway `HOME` so
it wrote into a scratch `next-theme` directory instead of the real one:

```bash
FH=<fresh empty scratch dir>              # e.g. mktemp -d, never the real HOME
O=~/.local/share/omarchy
mkdir -p "$FH/.local/state/omarchy/current/next-theme" "$FH/.config/omarchy/themed"
cp ~/.config/omarchy/themed/zed-theme.json.tpl "$FH/.config/omarchy/themed/"
cp "$O/themes/flexoki-light/colors.toml" "$FH/.local/state/omarchy/current/next-theme/"
env HOME="$FH" OMARCHY_PATH="$O" bash "$O/bin/omarchy-theme-set-templates"
ls "$FH/.local/state/omarchy/current/next-theme"   # zed-theme.json, vscode-theme.json, colors.toml, …
```

Verified: `omarchy-theme-color --file "$O/themes/flexoki-light/colors.toml" mode`
reports `light`, and the rendered `zed-theme.json`/`vscode-theme.json` both
show `appearance`/`type: "light"` with `editor.background` /
`colors["editor.background"]` at `#FFFCF0`. Use a fresh scratch directory
per render — two renders into the same directory overwrite each other.

Fixture assembly, after the render:

```bash
D=tests/fixtures/themes/flexoki-light
echo "flexoki-light" > "$D/theme.name"
cp "$O/themes/flexoki-light/colors.toml" "$D/theme/colors.toml"
cp "$O/themes/flexoki-light/vscode.json" "$D/theme/vscode.json"
cp "$FH/.local/state/omarchy/current/next-theme/zed-theme.json" "$D/theme/zed-theme.json"
cp "$FH/.local/state/omarchy/current/next-theme/vscode-theme.json" "$D/theme/vscode-theme.json"
cp ~/.local/state/omarchy/current/theme/backgrounds/omarchy.webp "$D/theme/backgrounds/omarchy.webp"
ln -sf theme/backgrounds/omarchy.webp "$D/background"
```

The background image is the same tiny 716-byte `omarchy.webp` reused for
both fixtures — `readTheme` only needs a file to resolve, not a real
matching wallpaper.

## What was deliberately not copied

Only the files `readTheme` reads were copied — not the rest of the live
`theme/` directory (`hyprlock.conf`, `kitty.conf`, `alacritty.toml`, the
preview PNGs, etc.), and not the other ~40MB of non-`omarchy.webp`
background images under `theme/backgrounds/`.

## `background` symlinks

Both fixtures' `background` files are **relative** symlinks
(`theme/backgrounds/omarchy.webp`), committed as symlinks (git stores them
natively). `readTheme` resolves them with `realpath`, so the test asserts
the resolved path ends with `theme/backgrounds/omarchy.webp` rather than
comparing to a fixed absolute path.
