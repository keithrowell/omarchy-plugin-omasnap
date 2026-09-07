---
number: 0005
title: VS Code grammar sourcing — read live off the installed VS Code, don't vendor
status: accepted
date: 2026-09-07
---

# ADR-0005: VS Code grammar sourcing — read live off the installed VS Code, don't vendor

## Status

accepted

## Context

The VS Code highlighter needs a TextMate grammar per language, tokenized the
way VS Code itself does. Options considered, mirroring the choice
`docs/adr/0002-grammar-sourcing.md` made for Zed's tree-sitter grammars:

- **Vendor grammar files**, fetched from `microsoft/vscode` (built-in
  languages) and per-language marketplace-extension repos (Rust, Go, Lua,
  ...), pinned to a commit like the tree-sitter grammars are. Deterministic,
  but drifts from whatever VS Code version is actually installed, needs
  periodic re-pinning, and — critically — two of the three languages
  initially wanted this way (Rust, Go) turned out to have **no** real static
  grammar in their marketplace extensions at all: `rust-analyzer` and
  `golang.go` colour `.rs`/`.go` files entirely through LSP semantic tokens,
  so vendoring *a* grammar for them would mean shipping something a real
  user's VS Code doesn't actually render with.
- **Read grammars live off the installed VS Code.** VS Code's built-in
  languages (JavaScript, JSON, Python, ...) ship as ordinary extensions
  inside its own install tree (e.g.
  `/usr/share/code/resources/app/extensions/javascript/syntaxes/*.json` —
  confirmed on this machine, package `visual-studio-code-bin`), laid out
  identically to a marketplace extension: a `package.json` with
  `contributes.grammars`, naming a scope and a grammar file path. Reading
  these directly, plus the same layout under `~/.vscode/extensions/`,
  needs no vendoring, no pinning, and no network at any point — and adapts
  automatically: if a language has no grammar anywhere (Rust, Go, today),
  the highlighter simply has nothing to load and falls back to the generic
  highlighter (`lib/vscode-extensions.mjs`'s `resolveGrammar` returning
  `null`); if the user later installs a marketplace extension that *does*
  ship one, it starts working with no code change here.

Zed had no equivalent second option: it statically links its tree-sitter
grammars into its own Rust binary and never lays them out as loose files on
disk, so vendoring was the only choice there.

## Decision

`lib/vscode-extensions.mjs` scans a short list of known VS Code-family
install roots (`/usr/share/code/resources/app/extensions`, and similar for VS Code
Insiders/OSS, VSCodium, Cursor) plus the user's marketplace-extension
directories (`~/.vscode/extensions` and siblings), reading every
`package.json`'s `contributes.grammars` into one scope-name index. A small
static table (`LANGUAGE_TO_VSCODE_ID`) maps `lib/language.mjs`'s language
ids to VS Code's own language ids, since those are stable, well-known
strings; the grammar file each one resolves to is fully dynamic. Only
`vscode-textmate` and `vscode-oniguruma` — the tokenizer engine itself, not
any grammar — are vendored (`vendor/textmate/`, MIT, ~500 KB including the
oniguruma WASM binary), via `tools/vendor-textmate.sh`.

## Consequences

- Easier: always matches the actual installed VS Code version, with no
  re-vendoring step; Rust/Go/Lua/anything else "just works" the moment a
  real grammar-shipping extension is installed, with zero code changes;
  much less to vendor overall than the tree-sitter path (no per-language
  grammar files, no per-arch compile step — the WASM binary is
  architecture-independent).
- Harder: an install this module's `DEFAULT_APP_ROOTS` doesn't cover (an
  unusual distro package, a Flatpak/Snap sandbox layout) yields no built-in
  grammars for that machine; every affected language degrades to the
  generic highlighter rather than failing, but that's a silent quality
  regression a user might not notice. The candidate-path list may need
  extending as real installs turn up.
- Reversible: `lib/highlight/vscode.mjs`'s `highlight()` only needs
  `resolveGrammar()` to hand back a scope name and a file path — swapping
  the source of those (a vendored fallback set for the common built-ins,
  say) touches `lib/vscode-extensions.mjs` alone.
