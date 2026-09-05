---
title: Spike — verify the primary-selection input path and the tree-sitter + Zed-queries highlight path
slug: spike-selection-and-highlight-path
status: ready
depends_on: []
type: spike
route: spike
business_value: high
technical_certainty: low
created: 2026-09-05
outcome: findings.md answers every question below with evidence, within a 2-hour timebox, and ADR-0001 is amended if any answer changes the stack
claimed_by:
label:
claimed_at:
---

# Spike — verify the primary-selection input path and the tree-sitter + Zed-queries highlight path

## Problem / why now

ADR-0001 commits Omasnap to two mechanisms nobody has verified on this machine:
reading the editor's selection from the Wayland primary selection, and
colouring code with tree-sitter driven by Zed's own highlight queries. Every
other spec builds on both. Two hours now saves a rewrite later.

## Questions to answer (the timeboxed exploration goal)

**Input path**

1. With text selected in Zed 1.18 (Wayland), does `wl-paste --primary` return
   exactly that text, with nothing copied? Same for VS Code (install it if
   absent: `pacman -S code` or the AUR build, note which).
2. When a Hyprland keybinding runs a script, does `hyprctl activewindow -j` still
   report the editor as the active window, and does `wl-paste --primary` still
   see its selection?
3. What `class` does each editor report, and does the `title` carry the current
   filename in a parseable position? Record the exact strings.
4. Does `wl-paste --primary` behave when nothing is selected (exit code, message)?

**Highlight path**

5. Can `tree-sitter highlight` (CLI 0.26, pacman) run with Zed's
   `highlights.scm` for JavaScript and Python (vendored from the Zed repo,
   `crates/languages/src/<lang>/highlights.scm`) against the pacman
   `tree-sitter-javascript` / `tree-sitter-python` grammars? Which
   `~/.config/tree-sitter/config.json` (or per-invocation flags) is needed?
6. What capture names does Zed's query produce, and do they map onto the
   `syntax` keys in `~/.local/state/omarchy/current/theme/zed-theme.json`
   (with Zed's dotted-prefix fallback, e.g. `punctuation.bracket` →
   `punctuation`)? List any captures with no theme entry.
7. Is the CLI fast enough (under ~200 ms for a 60-line file), or is the Node
   binding (`tree-sitter` npm, vendored, or `web-tree-sitter` WASM) needed?

## Acceptance criteria

- [ ] `findings.md` in this spec's directory answers all seven questions, each with the command run and its output.
- [ ] A recommendation per path: proceed as ADR-0001 says, or the concrete alternative.
- [ ] If any answer changes the stack, ADR-0001 is amended (status stays accepted, with an "Amended" note) in the same change.
- [ ] Any throwaway scripts live under the spec directory, not in `lib/` or `app/`.

## Scope boundary

**In scope:** answering the questions above, with evidence.

**Out of scope:** any production code; supporting more than JavaScript and Python; VS Code highlighting.

## Edge cases and failure paths

- If Zed does not publish a primary selection, test whether `wtype` sending
  Ctrl+C then reading the clipboard is acceptable as the fallback, and how the
  user's clipboard is restored afterwards.
- If Zed's queries do not run under the tree-sitter CLI (query syntax that
  needs Zed's runtime predicates), note which predicates fail and whether
  stripping them is acceptable.

## Affected areas

`docs/agentile/specs/<this>/findings.md`; possibly `docs/adr/0001-*.md`.

## Open questions

None beyond the seven above; that is the spike.

## Verification

The reviewer reads `findings.md` and checks each answer has a reproducible command.
