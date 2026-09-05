---
title: Plugin packaging — manifest, launcher, install script, README and licence
slug: plugin-packaging
status: in_progress
depends_on: []
type: feature
route: background
business_value: medium
technical_certainty: high
created: 2026-09-05
outcome: bin/install runs cleanly twice (second run reports unchanged), the plugin appears under ~/.config/omarchy/plugins/com.keithrowell.omasnap, and the deploy gate in gates.json therefore works for every later ship
claimed_by: 1a113cd5-6977-4f8d-8308-ac8ac727576e
label: 
claimed_at: 2026-09-05T11:36:53Z
---

# Plugin packaging — manifest, launcher, install script, README and licence

## Problem / why now

The ship stage runs `bin/install` after every merge, so the packaging must
exist before the first feature ships. It also fixes the plugin id, layout and
the dependency check that every later spec assumes.

## Acceptance criteria

- [ ] `manifest.json` with `schemaVersion: 1`, id `com.keithrowell.omasnap`, name "Omasnap", version `0.1.0`, author, MIT licence, the one-line description from the brief, `kinds: []`, `keepLoaded: false` (same shape as the Pacman plugin).
- [ ] `bin/omasnap` launcher: checks `qs` is on PATH with the pacman hint, resolves `ROOT` via `readlink -f`, and `exec`s `qs -p "$ROOT/app/Main.qml" "$@"` (a placeholder `app/Main.qml` that opens a themed "Omasnap" window and exits on Esc is enough for now).
- [ ] `bin/install [--dry-run] [--uninstall]` modelled on Pacman's: idempotent, links `~/.local/bin/omasnap` when that directory exists, writes an `Omasnap.desktop` file, checks required packages (`quickshell`, `wl-clipboard`, `tree-sitter-cli`, the `tree-sitter-grammars` packages listed in `README.md`) and prints the missing ones with a `pacman -S` line, and prints (never applies) the Hyprland binding and window rule.
- [ ] `README.md`: what it is, a screenshot placeholder, install steps (clone into `~/.config/omarchy/plugins/com.keithrowell.omasnap` or symlink from the checkout, run `bin/install`), the binding, required packages, how colours are sourced, and the non-goals.
- [ ] `LICENSE` (MIT, Keith Rowell, 2026) and `.gitignore` covering `node_modules/` and `**/specs/.pull.lock`.
- [ ] `tests/install.test.mjs` runs `bin/install --dry-run` in a temporary HOME and asserts it reports what it would do without touching anything (as Pacman's test does).
- [ ] `bin/install` from this checkout symlinks the checkout into `~/.config/omarchy/plugins/com.keithrowell.omasnap` when that path is absent, so the deploy gate makes the working tree the installed plugin.

## Scope boundary

**In scope:** packaging and install; the placeholder window.

**Out of scope:** any snapping behaviour; the dotfiles submodule registration (done by hand in the dotfiles repo).

## Edge cases and failure paths

- Running `bin/install` from inside `~/.config/omarchy/plugins/...` (already installed): no symlink loop; report unchanged.
- `~/.local/bin` absent: skip the launcher with a note.
- Missing packages: report, exit 0 (install still completes so the deploy gate never blocks on optional tooling).

## Affected areas

`manifest.json`, `bin/omasnap`, `bin/install`, `app/Main.qml` (placeholder), `README.md`, `LICENSE`, `.gitignore`, `tests/install.test.mjs`.

## Open questions

None.

## Verification

`node --test tests/*.test.mjs`; the reviewer runs `bin/install` twice and `bin/omasnap` once.
