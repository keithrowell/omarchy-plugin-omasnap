---
title: Zed highlighter — tree-sitter with Zed's queries, coloured from the Zed Omarchy theme
slug: zed-highlighter
status: in_progress
depends_on: [spike-selection-and-highlight-path, theme-reader]
type: feature
route: foreground
business_value: high
technical_certainty: medium
created: 2026-09-05
outcome: highlight(text, language, theme) returns per-line styled spans whose colours equal the Zed theme's syntax map for every fixture language, verified by tests and by a side-by-side with Zed on one fixture
claimed_by: 1a113cd5-6977-4f8d-8308-ac8ac727576e
label: 
claimed_at: 2026-09-05T14:33:33Z
---

# Zed highlighter — tree-sitter with Zed's queries, coloured from the Zed Omarchy theme

## Problem / why now

The first outcome in the brief is code coloured exactly as Zed shows it under
the current Omarchy theme. Zed colours tree-sitter captures from its theme's
`syntax` map, so using Zed's own highlight queries with the same theme file
gives editor-exact output.

## Acceptance criteria

- [ ] `lib/language.mjs` exports `detectLanguage({ filename, text })` mapping extensions to a language id (js, jsx, ts, tsx, py, rb, sh/bash, json, yaml/yml, md, rs, c, lua, and every other grammar shipped) with a shebang fallback (`#!/usr/bin/env python3` and friends) and `null` when unknown.
- [ ] `lib/highlight/zed.mjs` exports `highlight({ text, language, theme })` returning `{ lines: [[{ text, color, fontStyle, fontWeight }]] }` where each line's spans cover every character exactly once (tabs and trailing whitespace preserved), and unknown language returns one plain span per line in the editor foreground.
- [ ] Parsers: pacman `tree-sitter-grammars` packages for what they cover; vendored builds under `vendor/grammars/` for TypeScript/TSX, Ruby, JSON, YAML (with each grammar's licence file). No network at runtime.
- [ ] Queries: Zed's `highlights.scm` (and `injections.scm` where Zed has one) vendored per language under `vendor/zed-queries/<lang>/` with Zed's licence and the upstream commit recorded in `vendor/zed-queries/SOURCE.md`.
- [ ] Capture-to-style uses `zedSyntaxStyle()` from the theme reader, so a capture Zed leaves uncoloured falls back exactly as Zed does.
- [ ] The engine (tree-sitter CLI or a Node binding) is whichever the spike recommended; the choice and the reason are recorded in `lib/highlight/zed.mjs`'s header comment.
- [ ] Performance: a 60-line JavaScript fixture highlights in under 200 ms on this machine (a test asserts under 1 s to stay robust; the 200 ms figure is checked by the reviewer).
- [ ] Tests in `tests/highlight-zed.test.mjs` and `tests/language.test.mjs` cover every supported language with a fixture under `tests/fixtures/code/`, asserting specific tokens (a keyword, a string, a comment, a function name) get the theme's colour for that capture.
- [ ] Side-by-side check recorded in the spec directory: one fixture opened in Zed and the same fixture's span colours, showing they match.

## Scope boundary

**In scope:** the languages listed, Zed's colouring rules, language detection.

**Out of scope:** VS Code (TextMate) highlighting; the generic non-editor highlight; rendering; Zed's semantic (LSP) highlighting, which Zed layers on top of tree-sitter and Omasnap will not reproduce.

## Edge cases and failure paths

- Text that fails to parse: tree-sitter always produces a tree; render with error nodes uncoloured, never fail.
- Very large selections (over 500 lines): still highlight; the frame spec decides whether to truncate.
- A language with a pacman grammar version newer than the vendored Zed query: log the mismatch and continue (captures that do not resolve are uncoloured).
- Mixed line endings and a missing trailing newline: preserve as given.

## Affected areas

`lib/language.mjs`, `lib/highlight/zed.mjs`, `vendor/grammars/`, `vendor/zed-queries/`, `tests/`, `README.md` (list the pacman packages required, for `bin/install` to check).

## Open questions

Which engine, and whether Zed's queries run unmodified — both answered by the spike this depends on.

## Verification

`node --test tests/*.test.mjs`; the reviewer compares the side-by-side record and spot-checks two tokens against `zed-theme.json`.
