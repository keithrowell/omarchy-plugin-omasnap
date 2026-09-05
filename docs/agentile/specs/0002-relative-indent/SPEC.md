---
title: Relative indent — strip the selection's common leading whitespace so the shallowest line sits flush left
slug: relative-indent
status: in_progress
depends_on: []
type: feature
route: background
business_value: high
technical_certainty: high
created: 2026-09-06
outcome: snapping a selection whose every line starts with six tabs renders the shallowest line at column one with deeper lines keeping their extra indent, verified by tests on lib/ and by a fixture render
claimed_by: 1a113cd5-6977-4f8d-8308-ac8ac727576e
label: 
claimed_at: 2026-09-05T23:36:46Z
---

# Relative indent — strip the selection's common leading whitespace so the shallowest line sits flush left

## Problem / why now

Code carved out of the middle of a file carries its absolute indent — six
tabs of dead space on the left of every line. That indent is meaningless once
the code stands alone; what matters is the indent *within* the selection.

## Acceptance criteria

- [ ] `lib/indent.mjs` exports `dedent(text)` returning `{ text, removed }`: it finds the longest common leading-whitespace **string** shared by every non-blank line (character-wise, so tabs and spaces are never confused with each other and a tab is never counted as N spaces), removes it from every line, and leaves blank or whitespace-only lines as empty lines. `removed` is the stripped prefix (for tests and a possible future "show absolute" toggle).
- [ ] `prepareSnap()` in `lib/snap.mjs` applies `dedent` before language detection and highlighting, so token spans are computed on the dedented text and the frame never sees the dead indent.
- [ ] Trailing whitespace on each line is left alone (not this spec's concern); line endings are preserved.
- [ ] Tests in `tests/indent.test.mjs`: mixed depths with tabs; mixed depths with spaces; a blank line in the middle; whitespace-only lines; a single line; lines with no common prefix (nothing removed); a tabs-vs-spaces mismatch (common prefix is empty, nothing removed); `removed` reported correctly.
- [ ] One render fixture whose lines all start with a deep indent, re-rendered to show the flush-left result, saved in this spec's directory.

## Scope boundary

**In scope:** the dedent and its wiring into the live path.

**Out of scope:** re-indenting to a different width; converting tabs to spaces; the fixture render path (`--fixture` inputs are already token spans).

## Edge cases and failure paths

- Selection that starts mid-line (the first line has no leading whitespace while the rest are indented): common prefix is empty, nothing is removed — correct, the user selected it that way.
- A selection with CRLF endings: the `\r` is not whitespace for this purpose; strip only leading spaces and tabs.
- Empty selection: returns empty, unchanged.

## Affected areas

`lib/indent.mjs` (new), `tests/indent.test.mjs` (new), `lib/snap.mjs`, `tests/snap.test.mjs`.

## Open questions

None.

## Verification

`node --test tests/*.test.mjs`; the reviewer selects an indented block inside a function in Zed, snaps it, and confirms the first line is flush left with inner indent preserved.
