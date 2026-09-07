# Contributing to Omasnap

Thanks for considering a contribution. Omasnap is a small, opinionated
Omarchy plugin — please open an issue before starting anything non-trivial
(a new editor, a new language, a behaviour change) so we can agree on the
approach before you invest time in it. Small fixes and clear bugs can go
straight to a pull request.

## Before you start

Omasnap only runs on [Omarchy](https://omarchy.org) (Arch Linux + Hyprland +
quickshell). You'll need a real Omarchy machine, or something close enough
to it, to develop and test against — this isn't something you can build or
run on macOS/Windows/generic Linux.

Install the runtime dependencies (see the README's package line):

```bash
sudo pacman -S --needed quickshell wl-clipboard qt6-5compat tree-sitter-cli gcc nodejs
```

## Development loop

```bash
bin/omasnap                        # run from the checkout: snap the current selection and preview it
node --test tests/*.test.mjs       # every test in the project
bin/build-grammars                 # compile vendored grammars (first run only; node --test does this too)
```

See the README's "Development" section for the fuller loop, including
`--fixture` rendering and why you need `omarchy-restart-shell` after
changing anything under `app/`.

## Ground rules

- **Every colour comes from the live Omarchy theme files.** Never hard-code
  a colour, in QML or JS.
- **No non-Omarchy chrome.** No macOS traffic lights, no theme picker, no
  styling that isn't driven by the current theme.
- **Runtime dependencies must be pacman-installable or already shipped by
  Omarchy.** No global npm installs at runtime — vendored JS is fine.
- **Logic lives in `lib/` as plain ES modules with no Qt imports.** QML
  under `app/` only renders; keep it thin and testable logic out of it.
- Keep the binding-to-preview path fast — the target is under about a
  second.

## Tests

`node --test tests/*.test.mjs` is the whole suite and is what CI runs on
every pull request. Please add or update tests for any behaviour change —
most of the codebase (everything under `lib/`) is plain JS and easy to unit
test without a live Hyprland/quickshell session.

## Submitting a pull request

1. Fork the repo and branch off `master`.
2. Make your change, with tests.
3. Make sure `node --test tests/*.test.mjs` passes locally.
4. Open a pull request describing what changed and why. Link the issue it
   resolves, if any.

`master` is protected: pull requests need CI passing before they can merge.

## Reporting bugs / requesting features

Use the issue templates — they ask for the bits that are actually useful
here (Omarchy/theme/editor details for bugs). See
[SECURITY.md](SECURITY.md) instead for anything that looks like a security
issue.

## Project structure and internal workflow

This repo runs its own development process (the "Agentile" loop — capture →
shape → spec → plan → build → verify → ship) documented in `CLAUDE.md` and
`docs/agentile/`. That's the maintainer's internal workflow, not a
requirement for contributors — you don't need it to submit a PR, but the
specs under `docs/agentile/specs/` and the ADRs under `docs/adr/` are useful
background reading if you want to understand why something was built the
way it was.

## Licence

By contributing, you agree your contribution is licensed under this
project's [MIT licence](LICENSE).
