# Plan — Plugin packaging: manifest, launcher, install script, README and licence

Written by the plan stage. The build stage follows what it says. The model for
everything here is the Pacman plugin at
`/home/keith/Dropbox (Maestral)/lab/omarchy_pacman` (`manifest.json`,
`bin/install`, `bin/pacman`, `tests/install.test.mjs`) — copy its shape and
its habits (idempotent, `--dry-run`, `--uninstall`, "not ours, left alone",
print-never-apply), then adapt as below.

## Files to touch

| File | Why |
|---|---|
| `manifest.json` | Omarchy plugin manifest, `schemaVersion: 1`, id `com.keithrowell.omasnap`. |
| `bin/omasnap` | Launcher: `qs` check with pacman hint, `ROOT` via `readlink -f`, `exec qs -p "$ROOT/app/Main.qml" "$@"`. |
| `bin/install` | Idempotent installer with `--dry-run` / `--uninstall`: plugin symlink, desktop file, `~/.local/bin/omasnap` launcher, package check, printed Hyprland binding + window rule. |
| `app/Main.qml` | Placeholder: one themed floating window titled "Omasnap", Esc quits. Colours read live from `colors.toml`. |
| `README.md` | What it is, screenshot placeholder, install, binding, required packages (the single source `bin/install` parses), how colours are sourced, non-goals. |
| `LICENSE` | MIT, Keith Rowell, 2026. |
| `.gitignore` | Already has `node_modules/` and `**/specs/.pull.lock`; verify, do not duplicate. |
| `tests/install.test.mjs` | `bin/install` against a scratch HOME (dry run, first/second run, uninstall, package report, printed snippet). |

No `lib/` module is created by this spec. No `app/lib` symlink yet (nothing in
`app/` imports from `lib/` until spec 0003).

## Approach

### manifest.json

Same keys and order as Pacman's:

```json
{
  "schemaVersion": 1,
  "id": "com.keithrowell.omasnap",
  "name": "Omasnap",
  "version": "0.1.0",
  "author": "Keith Rowell",
  "license": "MIT",
  "description": "Turn selected code into a beautiful, unmistakably Omarchy image for a social post, a doc, or a chat.",
  "kinds": [],
  "keepLoaded": false
}
```

### bin/omasnap

Copy `bin/pacman` verbatim, rename the messages (`omasnap:`), keep the
`sudo pacman -S quickshell` hint, and `exec qs -p "$ROOT/app/Main.qml" "$@"`.
Mode 0755.

### app/Main.qml (placeholder)

`ShellRoot { FloatingWindow { title: "Omasnap" ... } }` as in Pacman's
`Main.qml`, plus:

- **Colours.** No hex literal and no named colour in QML. Read
  `$HOME/.local/state/omarchy/current/theme/colors.toml` with a
  `Quickshell.Io.FileView` (`watchChanges: true`, `printErrors: false`) and
  pick `background` / `foreground` from the text with a small inline JS
  function (`/^\s*background\s*=\s*"(#[0-9a-fA-F]{3,8})"/m`). That function
  is theme-parsing code, so its regex is allowed by verify rule 3. While the
  file is not yet loaded, or a key is absent, fall back to Qt's system palette
  (`palette.window`, `palette.windowText`) — not to a literal. Spec 0003
  replaces this inline reading with `lib/theme.mjs` + a `Theme` singleton;
  keep the placeholder small so that swap is a deletion.
- **Content.** A centred `Text` reading "Omasnap" in the foreground colour
  (font: `monospace` family, no size assumptions beyond `pixelSize: 32`), and
  a smaller line "Select code, press the binding." beneath it.
- **Esc quits.** `Keys.onEscapePressed: Qt.quit()` on a focused `Item`
  (`focus: true`). Also `onClosing: Qt.quit()` so closing the window ends the
  process.
- Size: `implicitWidth: 640`, `implicitHeight: 360`.

Launch check: `qs -p app/Main.qml` must start without QML errors. The builder
runs it for two seconds with a timeout and reads stdout/stderr, e.g.
`timeout 3 qs -p app/Main.qml; echo $?` (exit 124 from timeout is fine; any
`QML` error line is not).

### bin/install

Start from Pacman's `bin/install` and change:

1. **Names.** `LAUNCH="$ROOT/bin/omasnap"`, launcher symlink
   `~/.local/bin/omasnap`, desktop file `Omasnap.desktop` (Name=Omasnap,
   Comment from the manifest description, `Exec="$LAUNCH"`, `Terminal=false`,
   `Categories=Utility;Graphics;`, `Keywords=code;snapshot;screenshot;image;`,
   `StartupNotify=false`, **no `Icon=` line** — there is no asset yet — and
   no `StartupWMClass`). Drop the whole "nothing named pacman on PATH" guard;
   `omasnap` shadows nothing.
2. **Plugin symlink (new, first step after arg parsing).**
   `PLUGIN="$HOME/.config/omarchy/plugins/com.keithrowell.omasnap"`.
   - If `readlink -f "$PLUGIN"` equals `$ROOT` (either the path is a symlink
     to this checkout, or this checkout *is* that directory, e.g. a submodule
     clone): `plugin: unchanged $PLUGIN -> $ROOT`. Never create a symlink when
     `ROOT` is inside `$PLUGIN` (no loop).
   - Else if `$PLUGIN` exists or is a dangling symlink: `plugin: not ours,
     left alone $PLUGIN` (exit 0, continue).
   - Else: `plugin: would link ...` under `--dry-run`, otherwise
     `mkdir -p "$(dirname "$PLUGIN")"; ln -s "$ROOT" "$PLUGIN"`, then
     `plugin: linked $PLUGIN -> $ROOT`.
   - `--uninstall`: remove `$PLUGIN` only when it is a symlink whose target
     resolves to `$ROOT` and `$ROOT` is not itself `$PLUGIN` (a submodule
     checkout is never removed); otherwise "not ours, left alone" / "absent".
3. **Package check (new, after the launcher).** The required package list
   lives in `README.md` on one line of the form
   `sudo pacman -S --needed quickshell wl-clipboard tree-sitter-cli ...`
   inside the "Required packages" section. `bin/install` extracts it with
   `grep -m1 -oE 'pacman -S --needed .*' "$ROOT/README.md" | cut -d' ' -f4-`.
   Then:
   - If `pacman` is not on PATH: `packages: skipped (pacman not on PATH)`.
   - Else `pacman -Q <pkgs>` once; parse the `error: package 'X' was not found`
     lines on stderr into a missing list. All present: `packages: all N
     present`. Some missing: `packages: missing <a> <b>` followed by the line
     `  sudo pacman -S --needed <a> <b>`. **Exit status stays 0** — missing
     packages never fail the install (spec edge case).
   - Under `--dry-run` the check still runs (it is read-only).
   The initial README list is exactly the packages that exist today:
   `quickshell wl-clipboard tree-sitter-cli tree-sitter-bash tree-sitter-c
   tree-sitter-javascript tree-sitter-lua tree-sitter-markdown
   tree-sitter-python tree-sitter-rust`. Spec 0005 will extend it.
4. **Printed, never applied: binding and window rule.** Replace Pacman's
   menu snippet with a Lua block for `~/.config/hypr/bindings.lua`
   (Omarchy's Hyprland config is Lua; see
   `~/.local/share/omarchy/default/hypr/apps/localsend.lua` for the rule
   shape). Print with the canonical plugin path, not `$ROOT`:

   ```
   Add these to ~/.config/hypr/bindings.lua (not applied)

   -- Omasnap: snap the selected code into an Omarchy-styled image.
   o.bind("SUPER + ALT + SHIFT + S", "Omasnap", "~/.config/omarchy/plugins/com.keithrowell.omasnap/bin/omasnap")
   o.window({ title = "^(Omasnap)$" }, { float = true, center = true })
   ```

   Keep `uwsm-app -- ` in front of the command when `uwsm-app` is on PATH,
   with Pacman's "(uwsm-app is not on PATH ...)" note otherwise.
5. **Order of output lines** (each prefixed `<thing>: <verb> ...` exactly as
   Pacman does, so tests can anchor on `^plugin: `, `^desktop file: `,
   `^launcher: `, `^packages: `): plugin, desktop file, launcher, packages,
   then the blank line and the Lua block.
6. Keep `set -euo pipefail`, the `say`/`would` helpers, `usage`, exit 2 on an
   unknown option, `update-desktop-database` best-effort.

### README.md

Sections, in order: title + one-paragraph description (from the brief);
`![Omasnap preview](preview.png)` with a note that the screenshot lands with
spec 0006; **Install** (clone into
`~/.config/omarchy/plugins/com.keithrowell.omasnap` *or* keep a checkout
elsewhere and let `bin/install` symlink it there; run `bin/install`; what
`bin/install` does, `--dry-run`, `--uninstall`); **Binding** (the Lua block
above, and that `bin/install` prints it); **Required packages** (the one
`sudo pacman -S --needed ...` line, and that `bin/install` reports missing
ones); **Where the colours come from**
(`~/.local/state/omarchy/current/theme/` — `colors.toml`, `zed-theme.json`,
`vscode.json`; read on every snap; nothing hard-coded); **Non-goals** (the
four from the brief). Mention the dotfiles-submodule route the way Pacman's
README does, briefly.

### LICENSE and .gitignore

Copy Pacman's `LICENSE` text with year 2026. `.gitignore` already contains
both required entries — leave it as is.

### tests/install.test.mjs

Model on Pacman's test file: `spawnSync(bin/install)` with `HOME` and
`XDG_DATA_HOME` pointing at a `mkdtemp` scratch home and a restricted `PATH`.
Build the PATH from a scratch `path/` dir of symlinks to the coreutils the
script needs (Pacman's `pathWithoutUwsm` helper) so `pacman` and `uwsm-app`
presence is controlled per test; add a **fake `pacman`** script to that dir
when a test needs one (`-Q` prints `error: package 'X' was not found` to
stderr for a chosen set and exits 1). Cases:

1. `--dry-run` in a fresh home: exit 0; `^plugin: would link`, `^desktop
   file: would write`, `^launcher: would link`; nothing created under the
   scratch home (no `.config`, no `.local/share`, empty `.local/bin`); the Lua
   block is present and contains both `o.bind(` and `o.window(`; "not
   applied" appears.
2. First real run links plugin/desktop/launcher; second run reports
   `unchanged` for all three and nothing `written|linked`.
3. Plugin symlink target: `readlinkSync(~/.config/omarchy/plugins/
   com.keithrowell.omasnap)` equals the repo root; the launcher symlink
   targets `bin/omasnap`; the desktop file has `Exec="<root>/bin/omasnap"`,
   `Terminal=false`, no `StartupWMClass`, no `Icon=`.
4. Running from inside the plugin path: pre-create
   `~/.config/omarchy/plugins/` in the scratch home and symlink
   `com.keithrowell.omasnap -> <root>` *before* the first run; expect
   `^plugin: unchanged` and no error. (This is the same code path as a
   submodule checkout, since `readlink -f` resolves both to `<root>`.)
5. A foreign plugin dir (a real directory at that path): `^plugin: not ours,
   left alone`; exit 0; other steps still happen.
6. `~/.local/bin` absent: `^launcher: skipped`, still exit 0.
7. Packages: with no `pacman` on PATH → `^packages: skipped`; with the fake
   `pacman` reporting two missing → `^packages: missing tree-sitter-rust
   tree-sitter-python` (order as reported) and a `sudo pacman -S --needed`
   line naming exactly those; exit 0 in both cases; with the fake reporting
   none missing → `^packages: all \d+ present`.
8. The README package line and the packages `bin/install` checks agree:
   parse `README.md` in the test with the same regex and assert the fake
   `pacman` received exactly that list (have the fake write its argv to a
   file in the scratch home).
9. `--uninstall` removes plugin symlink, desktop file and launcher, is
   idempotent (`absent` on the second run), leaves foreign files alone, and
   `--dry-run --uninstall` removes nothing.
10. Unknown option → exit 2 with usage on stderr.

Also `tests/manifest.test.mjs` (small): `manifest.json` parses, has the
required keys and values from the spec (`schemaVersion` 1, id, name,
version, license MIT, `kinds` `[]`, `keepLoaded` false).

## Test strategy

- Gate `test`: `node --test tests/*.test.mjs` — the two suites above. All
  tests use a scratch HOME; **never run the real `bin/install` during build**
  (that is the ship stage's deploy gate, run from the main checkout).
- Launch check (verify rule 6): `timeout 3 qs -p app/Main.qml` from the
  worktree prints no QML error; the builder pastes the log into the build
  report.
- Colour check (verify rule 3): `grep -rnE '#[0-9a-fA-F]{6}' app lib` must
  return nothing; the only hex-shaped text in `app/Main.qml` is the parsing
  regex `#[0-9a-fA-F]{3,8}`, which is a pattern, not a literal.
- Deploy gate `bin/install` runs at ship, from the main checkout, and must
  print `plugin: linked` the first time and `unchanged` the second.

## Risks and unknowns

- **`FloatingWindow` API and `palette`.** Quickshell 0.3.1's `FloatingWindow`
  is a `QtQuick.Window`-like item; `palette.window` is available on
  `Window`/`Item` in Qt 6. If `palette` is not exposed on `FloatingWindow`,
  read it from the inner `Item`. If it fails altogether, use `"transparent"`
  as the pre-load value and let the file load set the real colour — still no
  literal. The builder must actually launch it to confirm.
- **`pacman -Q` output format** is stable (`error: package 'X' was not
  found`), but the test uses a fake `pacman` so the suite does not depend on
  the machine's packages. The real check is exercised at ship.
- **Dropbox-synced checkout path contains a space**; keep every path quoted
  and keep `Exec="$LAUNCH"` double-quoted, as Pacman does.
- **Symlink loop**: guarded by comparing `readlink -f` of both sides before
  ever calling `ln`.
- **Worktree paths**: the builder works in a worktree outside the Dropbox
  tree (under the session scratchpad); `ROOT` resolves to the worktree there,
  which is fine for tests because HOME is scratch. The ship stage runs the
  deploy gate from the main checkout so the plugin symlink points at the
  Dropbox checkout, not the worktree.

## ADR

none — packaging follows ADR-0001 and the Pacman precedent; no new decision.
