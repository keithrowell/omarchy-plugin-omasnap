# Evidence renders

Both fixtures (`tests/fixtures/render/{hello,long}.json`) rendered under two
themes, from the repo root:

```bash
bin/omasnap --fixture tests/fixtures/render/hello.json \
  --wallpaper ~/.local/share/omarchy/themes/gruvbox/backgrounds/1-the-backwater.jpg \
  --out docs/agentile/specs/0004-frame-renderer/renders/hello-gruvbox-dark.png

bin/omasnap --fixture tests/fixtures/render/long.json \
  --wallpaper ~/.local/share/omarchy/themes/gruvbox/backgrounds/1-the-backwater.jpg \
  --out docs/agentile/specs/0004-frame-renderer/renders/long-gruvbox-dark.png

bin/omasnap --fixture tests/fixtures/render/hello.json \
  --theme-dir tests/fixtures/themes/flexoki-light/theme \
  --wallpaper ~/.local/share/omarchy/themes/flexoki-light/backgrounds/1-orb.png \
  --out docs/agentile/specs/0004-frame-renderer/renders/hello-flexoki-light.png

bin/omasnap --fixture tests/fixtures/render/long.json \
  --theme-dir tests/fixtures/themes/flexoki-light/theme \
  --wallpaper ~/.local/share/omarchy/themes/flexoki-light/backgrounds/1-orb.png \
  --out docs/agentile/specs/0004-frame-renderer/renders/long-flexoki-light.png
```

The gruvbox-dark pair uses the live theme's colours but an explicit
`--wallpaper`: the live `current/background` symlink points at the tiny
716-byte `omarchy.webp` the fixture theme dirs share (fine for `node --test`,
ugly as a backdrop), so both gruvbox renders point `--wallpaper` at a real
wallpaper from `~/.local/share/omarchy/themes/gruvbox/backgrounds/` instead,
matching the flexoki-light pair's own real wallpaper.
