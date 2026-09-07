---
number: 0008
title: Drop the Omarchy maze mark from the snap header
status: accepted
date: 2026-09-07
---

# ADR-0008: Drop the Omarchy maze mark from the snap header

## Status

Accepted.

## Context

Spec 0001 (`docs/agentile/specs/done/0001-omarchy-window-chrome/`) put a
small Omarchy maze glyph (U+E900 of the vendored `omarchy` icon font,
falling back to `~/.local/share/omarchy/icon.png`) top-left of the header,
replacing an earlier full wordmark image. Keith's own verdict at the time:
without any mark the window "is not obviously an Omarchy window", but a
full wordmark was unwanted — the maze glyph was the compromise.

Revisiting that call, two things from Omarchy's own conventions argue
against it:

- Omarchy's branding system (`~/.local/share/omarchy/manual/41-branding.md`)
  reserves the maze mark, and any personal replacement for it, for
  full-canvas surfaces — boot unlock, the screensaver, the About screen.
  It is never used to badge one window or one piece of content among many.
- The shell's own icon-plus-title header component, `PanelHero`
  (`/usr/share/omarchy/shell/Ui/PanelHero.qml`), is what Omasnap's header
  deliberately mirrors — the code comment says so. Every stock user of it
  (the Tailscale panel, the Dropbox panel, the agents panel) puts *that
  panel's own* icon in the slot: Tailscale's glyph, Dropbox's glyph, an
  agent provider's own icon. None of them puts the Omarchy mark itself
  there. Omasnap copied PanelHero's geometry but not its icon convention —
  the icon slot in that pattern identifies the specific thing on screen,
  not the platform showing it.

Omasnap has no icon of its own to put in that slot (it is not a persistent
app with a launcher identity the way Tailscale or Dropbox are), and the
snap image's real content — the code, the theme's colours, the exact
Hyprland border and corners, the live wallpaper — already reads as
unmistakably Omarchy on its own, which is the brief's own bar
("wearing your *actual* Omarchy theme"). A generic platform logo bolted
onto someone else's code screenshot reads more like a watermark than a
frame.

## Decision

Remove the maze glyph and its `icon.png` fallback from the header
entirely. The header is a plain two-line title/subtitle, left-aligned at
the header's own padding — no icon slot, filled or empty.

## Consequences

- Every rendered snap looks different: the eight gallery images and the
  README hero all need regenerating (`docs/gallery/SOURCES.md`'s
  reproduction steps, unchanged).
- `app/Snap.qml` drops `iconFontPath`, `mazeGlyph`, `headerGlyphFactor`,
  the `iconFont` `FontLoader`, the glyph `Text`, the fallback `Image` and
  its `ColorOverlay`, and the now-unused `Qt5Compat.GraphicalEffects`
  import — a real simplification, not just a visual change.
- Recognisability now rests entirely on the theme colours, the wallpaper,
  and the Hyprland-accurate frame — spec 0001's other criteria (border,
  rounding, gaps, sharp wallpaper, no wordmark) are untouched and still
  carry the "obviously Omarchy" outcome.
- If Omasnap ever gets its own distinct icon (not Omarchy's), the
  `PanelHero`-mirroring geometry this ADR removes is the place it would
  go back in — consistent with how the pattern is actually used elsewhere.
