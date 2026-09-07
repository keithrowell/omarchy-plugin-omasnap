---
number: 0007
title: Neovim support via live RPC — no static highlighter, no vendored theme mapping, and a deliberate exception to editor-agnostic input
status: accepted
date: 2026-09-07
---

# ADR-0007: Neovim support via live RPC — no static highlighter, no vendored theme mapping, and a deliberate exception to editor-agnostic input

## Status

accepted

## Context

Neovim is Omarchy's actual default editor (`omarchy-default-editor` defaults
to `nvim`, and it's the only editor every stock Omarchy theme ships styling
for — `neovim.lua`, present in 18 of 22 stock themes checked; VS Code/Zed
theme files are hand-authored personal extras, present in none of them).
Unlike Zed and VS Code, Neovim isn't its own window: it runs inside a
terminal emulator, so `hyprctl activewindow`'s `class` is the terminal's
(`foot`, `kitty`, ...), not Neovim's.

Two more differences from Zed/VS Code, discovered by spiking against a real
`foot`-hosted Neovim on this machine before designing anything:

1. **A live RPC channel is trivially available.** Every interactive Neovim
   spawns a nested "embedded core" process that auto-listens on
   `$XDG_RUNTIME_DIR/nvim.<pid>.0` — no `--listen`, no config. Querying it
   with `vim.treesitter.get_captures_at_pos()` + `nvim_get_hl()` returns the
   *exact* capture and resolved colour Neovim is already rendering, for the
   user's actual active colorscheme/plugins/LSP semantic tokens. This means
   Omasnap doesn't need to implement a highlighter for Neovim at all, or
   parse `neovim.lua` into a theme mapping — a fundamentally simpler
   position than either the Zed (vendored tree-sitter + Zed's queries) or
   VS Code (vendored tokenizer + grammars read off the install) path.
2. **The live buffer's own visual-mode marks are readable mid-selection**
   (`line("v")`/`line(".")` while still in Visual mode — `'<`/`'>` only
   update *after* leaving it). A keyboard-only Neovim user (the common case)
   typically never touches the system clipboard, so relying on the Wayland
   primary selection — every other editor's uniform input path, and a
   documented `CLAUDE.md` constraint ("input is editor-agnostic... reads the
   Wayland primary selection") — would silently miss most real selections.

Options considered for input:

- **Stay uniform**: read only the Wayland primary selection for Neovim too.
  No constraint exception, but only works if the user's Neovim syncs visual
  selections to the system clipboard (`clipboard=unnamedplus` and
  equivalent), which isn't everyone's setup, and never fires for a
  selection that hasn't been yanked yet.
- **RPC selection, with a primary-selection fallback** (chosen): query the
  live visual selection directly; if none is active (or Neovim/RPC isn't
  reachable), fall back to the Wayland primary selection exactly like every
  other editor. Confirmed end-to-end against a real `foot` + Neovim window.

## Decision

`lib/nvim-rpc.mjs` finds the Neovim inside a terminal window's process tree
(walking `/proc`, since Neovim's own TUI process and its embedded core are
*both* named `nvim` — only the inner one listens, so every match is tried
and confirmed via its own `getpid()`, never assumed), discovers its socket,
and runs `lib/nvim/probe.lua` inside it via `nvim --server <addr>
--remote-expr` (reusing the real `nvim` CLI as a msgpack-RPC client, the
same "shell out to the real tool" posture as `docs/adr/0002`'s `tree-sitter`
CLI reuse). The probe reports the live visual selection's text *and*
per-character resolved colours in one round-trip — text and colour can
never desync, since both come from the same query.

`lib/editors/neovim.mjs` (an adapter in the new `lib/editors/registry.mjs`
plugin architecture — see that module's header for the interface) is the
only adapter that overrides `resolveSelection()`: a live selection replaces
the primary-selection text outright and supplies already-highlighted
`lines`, skipping `highlight()` entirely. `resolveSelection()` returning
`null` (no reachable Neovim, or nothing currently selected) falls the
request all the way back to the Wayland primary selection and the universal
highlighter, exactly as if Neovim support didn't exist for that snap.

Font is *not* sourced from Neovim: a terminal renders it, not Neovim
itself, so `lib/editors/neovim.mjs`'s `font()` returns `null` (system
monospace fallback) rather than guessing at the terminal's own config.

## Consequences

- Easier: no highlighter to build or maintain for Neovim, no theme file to
  parse — correctness follows the user's actual live colorscheme
  automatically, including plugins and LSP semantic tokens Omasnap could
  never otherwise reproduce.
- Harder: Neovim is the only editor whose colours depend on a live process
  being reachable at snap time (RPC socket found and responsive) rather
  than a static file on disk — a wedged or slow Neovim could in principle
  delay a snap (mitigated by a short subprocess timeout in
  `lib/nvim-rpc.mjs`, degrading to the primary-selection path). The
  candidate terminal-class list (`TERMINAL_CLASSES`) is best-effort, same
  posture as VS Code's install-root list (`docs/adr/0005`) — an
  unrecognised terminal emulator just never attempts the RPC path.
- A deliberate, documented exception to "input is editor-agnostic": Neovim
  is the only editor that doesn't route through the Wayland primary
  selection when a live RPC selection is available. Every other editor,
  and Neovim itself with no active selection, is unaffected.
- Reversible: `resolveSelection()` returning `null` is indistinguishable
  from "Neovim adapter doesn't exist" to the rest of the pipeline — the
  RPC mechanism could be replaced or removed without touching anything
  outside `lib/nvim-rpc.mjs`/`lib/editors/neovim.mjs`.
