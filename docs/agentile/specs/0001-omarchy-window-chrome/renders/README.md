# Renders — omarchy-window-chrome

Evidence for the acceptance criteria: Hyprland border/rounding/gaps from
`lib/hypr.mjs`, the Omarchy maze glyph + filename/source header (the shell's
`PanelHero`/`PanelSeparator` pattern), a sharp (unblurred) wallpaper, and no
wordmark. Compare beside `~/.local/share/omarchy/themes/gruvbox/preview.png`
(a real tiled Hyprland desktop) and `~/.local/share/omarchy/themes/flexoki-light/preview.png`.

## Commands

```bash
bin/omasnap --fixture tests/fixtures/render/hello.json \
  --wallpaper ~/.local/share/omarchy/themes/gruvbox/backgrounds/1-the-backwater.jpg \
  --out docs/agentile/specs/0001-omarchy-window-chrome/renders/hello-gruvbox-dark.png

bin/omasnap --fixture tests/fixtures/render/long.json \
  --wallpaper ~/.local/share/omarchy/themes/gruvbox/backgrounds/1-the-backwater.jpg \
  --out docs/agentile/specs/0001-omarchy-window-chrome/renders/long-gruvbox-dark.png

bin/omasnap --fixture tests/fixtures/render/hello.json \
  --theme-dir tests/fixtures/themes/flexoki-light/theme \
  --wallpaper ~/.local/share/omarchy/themes/gruvbox/backgrounds/1-the-backwater.jpg \
  --out docs/agentile/specs/0001-omarchy-window-chrome/renders/hello-flexoki-light.png

bin/omasnap --fixture tests/fixtures/render/long.json \
  --theme-dir tests/fixtures/themes/flexoki-light/theme \
  --wallpaper ~/.local/share/omarchy/themes/gruvbox/backgrounds/1-the-backwater.jpg \
  --out docs/agentile/specs/0001-omarchy-window-chrome/renders/long-flexoki-light.png

# Fallback look: hyprctl unavailable/fails -> Omarchy defaults, accent border.
PATH="<dir with a hyprctl that exits 1>:$PATH" \
  bin/omasnap --fixture tests/fixtures/render/long.json \
  --wallpaper ~/.local/share/omarchy/themes/gruvbox/backgrounds/1-the-backwater.jpg \
  --out docs/agentile/specs/0001-omarchy-window-chrome/renders/long-fallback-look.png

# Shadow enabled: hyprctl answers decoration:shadow:enabled true (range 12).
PATH="<dir with a hyprctl answering shadow:enabled true>:$PATH" \
  bin/omasnap --fixture tests/fixtures/render/hello.json \
  --wallpaper ~/.local/share/omarchy/themes/gruvbox/backgrounds/1-the-backwater.jpg \
  --out docs/agentile/specs/0001-omarchy-window-chrome/renders/hello-shadow-enabled.png
```

## This desktop's live Hyprland look (`hyprctl getoption -j`, read by `lib/hypr.mjs`)

| Option | Value |
|---|---|
| `general:border_size` | 2 |
| `decoration:rounding` | 6 |
| `general:gaps_out` | 10 |
| `general:gaps_in` | 5 |
| `general:col.active_border` | `ff7daea3 0deg` → `#7daea3` (gruvbox's own accent, coincidentally) |
| `decoration:shadow:enabled` | `false` |

Every render below shows this desktop's real border (2px, `#7daea3`, 6px
rounding) and no shadow — **including the flexoki-light renders**, whose
window fill/text/header still come from flexoki-light's `colors.toml` and
`zed-theme.json`. This is correct, not a bug: `look` is Hyprland's live
config, not the theme's; a real Hyprland desktop draws every window's border
in its one configured colour regardless of that window's own app theme.

## Wallpaper substitution (deviation from the plan)

The plan's flexoki-light wallpaper command was
`--wallpaper "$(ls .../flexoki-light/backgrounds/* | head -1)"`, i.e.
`1-orb.png`. I initially mis-diagnosed that file as triggering a
Qt/Quickshell rendering bug; it doesn't. `1-orb.png` is a 3840×2160 image
that is **near-flat cream everywhere except one small dark orb centred at
roughly 45%, 45%** of the frame. `app/Snap.qml`'s window sits centred in
the canvas and, at this fixture's size, covers almost the entire frame —
so the one part of the wallpaper with any visible content lands *behind
the window itself*, and the thin margin actually visible around the
window is genuinely, correctly flat cream. This isn't format- or
code-path-specific: converting `1-orb.png` to JPEG still looks flat in the
same crop, and converting `1-the-backwater.jpg` (gruvbox's wallpaper,
full of fine detail everywhere) to PNG still renders in full detail —
`wallpaperImage.status` is `Ready` and the `Image` paints correctly in
every case I tried. The flexoki-light renders here use gruvbox's own
wallpaper via `--wallpaper` purely so the evidence has visible wallpaper
texture in the margin to judge "sharp, no blur" against — flexoki-light's
own wallpaper would demonstrate the same criterion just as validly, only
less legibly for a screenshot.

## Files

| File | What it shows |
|---|---|
| `hello-gruvbox-dark.png` (1088×734) | Short fixture, live theme + look. |
| `long-gruvbox-dark.png` (3328×2037) | Long fixture (many lines, a 240-char line that clips with `…`), live theme + look. |
| `hello-flexoki-light.png` (1088×734) | Short fixture, flexoki-light colours + Zed syntax, live (gruvbox) look — border/rounding unchanged, window fill/text/header switch to the light theme. |
| `long-flexoki-light.png` (3328×2037) | Long fixture, flexoki-light + live look. |
| `long-fallback-look.png` (3328×2037) | Long fixture with a `hyprctl` on `PATH` that exits 1 for every call: `look.source === "defaults"` (Omarchy's `2/0/10/5`/off), `activeBorder` is the theme's own accent, square corners (`rounding: 0`) — proves the non-Hyprland path (CI, another compositor) still completes and still looks like *an* Omarchy window. |
| `hello-shadow-enabled.png` (1088×734) | Short fixture with a `hyprctl` answering `decoration:shadow:enabled` `true` (range 12): `look.shadowEnabled === true`, `MultiEffect` draws a soft dark shadow around the border, no QML warnings in the Quickshell log. Pixel `(56,400)` goes from `srgba(135,101,58,1)` with no shadow (`hello-gruvbox-dark.png`, same fixture/theme/wallpaper) to `srgba(122,92,53,1)` here — darker, as expected. |

## What to check against `preview.png`

Border width and colour (2px, `#7daea3`, matching the live desktop), 6px
rounding (square in the fallback render), no shadow except in
`hello-shadow-enabled.png` (a soft dark ring, not a stray warning), sharp
wallpaper (no blur, no darkening overlay), the maze glyph top-left of the
header in accent, filename + `SOURCE · LANGUAGE` beneath it, a faint
separator above the code, margins that read like Hyprland gaps (not a
floating card), and no wordmark anywhere.
