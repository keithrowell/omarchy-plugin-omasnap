---
number: 0002
title: Grammar sourcing — vendored tree-sitter sources at Zed's pins, built at install time
status: proposed
date: 2026-09-06
---

# ADR-0002: Grammar sourcing — vendored tree-sitter sources at Zed's pins, built at install time

## Status

proposed (accepted when spec 0005 merges)

## Context

Spec 0005 needs a tree-sitter parser per language that matches what Zed
itself uses, because Zed's `highlights.scm` queries reference node types of
specific grammar versions (the spike showed Zed's JavaScript query does not
even compile against upstream `tree-sitter-javascript`; Zed parses `.js` with
the `tsx` grammar from its own `tree-sitter-typescript` fork). Options:

- **pacman `tree-sitter-grammars` packages** (`/usr/lib/tree_sitter/<lang>.so`):
  pacman-installable, but versioned by Arch, not by Zed; several languages
  Zed needs are not packaged at all (Zed's tsx fork, its yaml and markdown
  forks, ruby); and four of the packaged ones are not installed on the dev
  machine and need sudo.
- **Vendored prebuilt `.so` files**: no network, but architecture-specific —
  the development machine is aarch64 while most Omarchy installs are x86_64.
- **Vendored grammar sources** (`src/parser.c`, `src/scanner.c`, headers,
  `tree-sitter.json`, licence) at exactly the commits Zed pins, compiled
  once at install time with `tree-sitter build` (tree-sitter-cli and gcc are
  pacman/base-devel, which Omarchy ships). Architecture-independent, exact
  versions, no network at runtime; costs ~35 MB of C in the repository and a
  one-off compile (seconds per grammar, under a minute for TSX) on install.
- **WASM via web-tree-sitter**: architecture-independent and small, but needs
  a WASM build toolchain (emscripten) to produce the `.wasm` files, and the
  spike found the CLI route fast enough.

## Decision

Vendor grammar **sources** under `vendor/grammars/<name>/` at the commit or
tag Zed pins for the installed Zed version (`Cargo.lock` for built-ins,
`extension.toml` for extension languages), each with its licence and a
`SOURCE` file. `bin/build-grammars` compiles them with `tree-sitter build`
into `vendor/grammars/lib/<name>.so` (gitignored), idempotently by mtime;
`bin/install` runs it as part of the deploy gate. The highlighter drives the
tree-sitter CLI (`tree-sitter query --lib-path … --lang-name …`) against those
`.so` files. pacman grammar packages are **not** used by the highlighter;
`bin/install` no longer lists them as required.

## Consequences

- Easier: identical highlighting on every architecture; grammar versions
  track Zed, not Arch; upgrading Zed support is "bump the pins, re-vendor".
- Harder: the repository carries ~35 MB of generated C; first install compiles
  for up to a minute; the vendoring script must be re-run when Zed's pins
  move; users need `tree-sitter-cli` and a C compiler (both standard on Omarchy).
- Reversible: the highlighter only needs a `.so` per language; swapping the
  source of those files later (pacman, prebuilt, WASM) touches `bin/build-grammars`
  and the lookup, not the highlighter.
