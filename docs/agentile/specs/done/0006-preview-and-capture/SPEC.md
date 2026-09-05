---
title: Preview and capture — SUPER+ALT+S snaps the selection, previews it, copies or saves the PNG
slug: preview-and-capture
status: shipped
shipped_at: 2026-09-05T17:00:03Z
depends_on: [spike-selection-and-highlight-path, zed-highlighter, frame-renderer]
type: feature
route: foreground
business_value: high
technical_certainty: medium
created: 2026-09-05
outcome: with code selected in Zed, SUPER+ALT+S shows the preview within about a second, Enter puts a PNG on the clipboard that pastes into a browser, S saves it under ~/Pictures
claimed_by: 1a113cd5-6977-4f8d-8308-ac8ac727576e
label: 
claimed_at: 2026-09-05T16:04:21Z
---

# Preview and capture — SUPER+ALT+S snaps the selection, previews it, copies or saves the PNG

## Problem / why now

This is the brief's first outcome end to end: select in Zed, one binding, a
gorgeous PNG on the clipboard and on disk, with a preview to confirm.

## Acceptance criteria

- [ ] `bin/omasnap` (no flags) does, in order: read `wl-paste --primary --no-newline`; if empty, read `wl-paste --no-newline`; if still empty, `notify-send` "Omasnap: nothing selected" and exit 0. Read `hyprctl activewindow -j` for `class` and `title`; detect the editor (Zed by class as recorded in the spike; VS Code by class; otherwise "other"); extract the filename from the title using the patterns the spike recorded.
- [ ] `lib/snap.mjs` exports `prepareSnap({ text, windowClass, title })` returning the frame renderer's input (language via `detectLanguage`, spans via the Zed highlighter, font via `readEditorFont`, filename). For "other" windows it still highlights with the Zed pipeline and the Zed theme (the generic highlighter is a later spec), and the title bar shows the language.
- [ ] The preview is a floating Quickshell window titled "Omasnap" showing the rendered frame at fit-to-window scale, with three theme-styled buttons: **Copy** (Enter), **Save** (S), **Close** (Esc), and a language dropdown pre-set to the detected language that re-highlights on change.
- [ ] Copy writes the PNG bytes with `wl-copy --type image/png` and shows a notification "Copied to clipboard"; the window stays open.
- [ ] Save writes `$(xdg-user-dir PICTURES)/omasnap-YYYY-MM-DD_HH-MM-SS.png`, notifies with the path, and stays open.
- [ ] A Hyprland window rule in `README.md` floats and centres the preview (`float`, `center`, by title "Omasnap"); `bin/install` prints the rule and the binding `SUPER + ALT + S` → `<plugin dir>/bin/omasnap` for `~/.config/hypr/bindings.lua` (printed, never applied, like Pacman's menu entry).
- [ ] Binding to visible preview in about one second for a 60-line selection (measured by the reviewer with `time` on `bin/omasnap --benchmark`, which runs everything but the window).
- [ ] Selection text is never passed through a shell: it flows from `wl-paste` via stdout into Node and into QML as data.
- [ ] Tests: `tests/snap.test.mjs` covers filename extraction for the recorded title patterns, editor detection by class, and the empty-selection path.

## Scope boundary

**In scope:** the full Zed path, the "other window" fallback via the Zed pipeline, copy and save.

**Out of scope:** VS Code-specific colouring (its own spec); backdrop variants; editing, cropping or annotation; remembering settings.

## Edge cases and failure paths

- Selection larger than 200 lines: warn in the preview ("snapping first 200 lines") and truncate.
- Binary-looking or extremely long single line (over 2000 chars): still render, clipped per the frame spec.
- `hyprctl` unavailable (not on Hyprland): treat as "other", language from content only.
- Clipboard write fails (`wl-copy` missing): notify with the install hint and keep the window open.
- `~/Pictures` missing: create it.
- A second SUPER+ALT+S while a preview is open: close the old preview and open the new one.

## Affected areas

`bin/omasnap`, `lib/snap.mjs`, `app/Main.qml`, `app/Preview.qml`, `README.md`, `bin/install` (printing the binding and rule), `tests/snap.test.mjs`.

## Open questions

None once the spike has recorded the class and title patterns.

## Verification

`node --test tests/*.test.mjs`; the reviewer runs the real flow from Zed: preview appears, Enter then paste into a browser shows the image, S produces the file. Also runs it from a terminal with text selected to confirm the "other" path.
