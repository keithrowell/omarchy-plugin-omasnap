---
number: 0003
title: Live preview moves into an Omarchy shell service, for marketplace listing
status: accepted
date: 2026-09-06
---

# ADR-0003: Live preview moves into an Omarchy shell service, for marketplace listing

## Status

accepted

## Context

Keith wants Omasnap listed on plugins.omarchy.org. Submission requires
`omarchy plugin validate` to pass, and that validator (mirrored by the
marketplace's own automated check) hard-requires a manifest's `kinds` array
to be non-empty, each kind naming a real Omarchy-shell integration point
(`bar`, `bar-widget`, `menu`, `overlay`, `panel`, or `service`) backed by a
QML file in `entryPoints`. Omasnap's manifest has always declared
`"kinds": []` — deliberately, per ADR-0001: the live preview is a fully
standalone `qs -p app/Main.qml` process, spawned fresh by `bin/omasnap` on
every keypress and never loaded by the Omarchy shell.

A survey of the live marketplace registry (2,486 listed sources) found no
plugin without at least one real kind. The closest conceptual match,
`omashot` (a screenshot/recording tool), declares `kinds: ["service",
"overlay"]` with real `Service.qml` and `Overlay.qml` entry points loaded
into the shell's own process. A standalone-process app, however similar in
spirit, is not a shape this marketplace lists.

Reading the shell's own loader (`shell.qml`'s `ensureService()`) shows the
contract precisely: a plugin's `entryPoints.service` file is instantiated
once, as a plain object (not a `ShellRoot`), parented under a non-visual
`Item` (`serviceHost`) inside the *already-running* Omarchy shell process
— the one long-lived `quickshell` process every Omarchy session already
has. It stays alive for as long as the plugin is enabled
(`omarchy plugin enable <id>`). Any QML object, regardless of where it sits
in the tree, can still open its own top-level `Window`/`FloatingWindow`, so
a service does not need the `overlay` kind just to show a floating window
— that kind is for compositor-covering overlay layers, which Omasnap's
card-shaped preview isn't.

The shell also already ships a documented IPC layer for exactly this: a
QML `IpcHandler { target: "..." }` anywhere in the loaded tree becomes
callable from outside with `qs ipc call <target> <function> [args...]`
(wrapped, for the Omarchy shell specifically, by `omarchy-shell <target>
<function> [args...]`). This is how `bin/omasnap` can still trigger showing
the preview without spawning a new process.

## Decision

- Add one real kind: `"kinds": ["service"]`, `"entryPoints": {"service":
  "app/Service.qml"}`, `"keepLoaded": true` in `manifest.json`.
- `app/Service.qml` (new): a small, always-loaded object exposing
  `IpcHandler { target: "omasnap" }` with one function, `show(inputPath,
  requestPath, rootDir, previewPngPath, auto, shotPath)`. It destroys any
  previous preview instance (replacing the old `qs kill -p
  ".../Main.qml"` behaviour) and creates a fresh `Overlay.qml`.
- `app/Overlay.qml` (new): today's `app/Preview.qml`, with its
  `Quickshell.env("OMASNAP_*")` reads replaced by constructor properties —
  the UI, the copy/save/re-highlight logic and the `OMASNAP_AUTO` testing
  hooks are otherwise unchanged.
- `bin/omasnap`'s **live path only** changes its final step: instead of
  `qs kill -p ... ; OMASNAP_MODE=preview ... qs -p app/Main.qml`, it calls
  `omarchy-shell omasnap show <input> <request> <root> <previewPng> <auto>
  <shotPath>`. Everything before that — reading the selection, calling
  `hyprctl`, running `lib/snap.mjs` — is untouched.
- **Fixture, benchmark, and render modes are untouched.** They stay
  standalone `qs -p app/Main.qml` invocations (`app/Main.qml`'s render and
  placeholder branches are unaffected); tests, the reviewer's fixture
  checks, and the example gallery keep working exactly as before. Only the
  interactive, keybinding-triggered path moves into the shell.
- `bin/install` prints, but does not run, `omarchy plugin enable
  com.keithrowell.omasnap`, alongside the Hyprland binding it already
  prints — consistent with never touching shared/live state automatically.

## Consequences

- Easier: eligible for plugins.omarchy.org; one long-lived process instead
  of one per snap (marginally faster second-and-later snaps, no repeated
  Qt/QML startup cost); "replace the open preview" is a plain object
  destroy instead of `qs kill`.
- Harder: the live preview now depends on the Omarchy shell actually
  running and this plugin being enabled in it — a fresh install needs one
  extra step (`omarchy plugin enable`) beyond `bin/install`, and `bin/omasnap`
  needs a clear error message when the service isn't reachable, rather than
  the old self-contained "just spawn qs" path that needed nothing external
  running.
- Committed to: keeping the fixture/render path fully standalone (so
  testing and the gallery never depend on a running shell or an enabled
  plugin) while the live path depends on both. Two paths through the same
  QML component tree (`Snap.qml` is shared, `Main.qml` vs. `Service.qml`
  + `Overlay.qml` are not) is the accepted complexity for keeping the
  marketplace-required integration to the smallest real surface.
