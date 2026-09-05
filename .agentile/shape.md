# Shaping — Definition of Ready

This file defines **what "shaped" means in this project**: the questions a stub must answer before it graduates from the Inbox into a Ready spec. The `/ag-shape` skill reads this file and runs the interview against it.

This is the single most useful file to tailor. Add a question and every future shaping conversation asks it. Remove one and it stops. The *structure* — interview one or two questions at a time, then write the spec — never changes; only the checklist below does.

## Required — a stub is not Ready until all of these are answered

- **Problem / who for / why now** — the business justification behind the stub. What hurts, for whom, and why it matters this cycle.
- **Acceptance criteria** — what "done" observably looks like. Concrete, checkable statements, not vibes.
- **Edge cases and failure paths** — what the agent must *not* assume; what happens when things go wrong.
- **Scope boundary** — what is explicitly **out**, so the work can't balloon.
- **Affected areas** — the files, services, or data the change likely touches.
- **Open questions** — anything still unknown. Surviving unknowns become a timeboxed **spike**, not a guess.
- **Dependencies** — does this need another spec shipped first? List those specs' slugs in `depends_on` (or none).

## Triage (always run during shaping)

- Estimate **Business Value × Technical Certainty** (see `.agentile/config.md`).
- Recommend a **route**: foreground pair, background agent, spike, or drop.

## Interview style

- Ask **one or two questions at a time**, not a form. Let answers shape the next question.
- Prefer concrete examples over abstractions ("show me what the user sees" beats "describe the feature").
- It is cheaper to kill or reshape an idea here, in words, than after code exists. Splitting, merging, deferring, or dropping a stub are all good outcomes.

## Frontmatter hygiene

- **No unquoted colons in frontmatter values.** `title: Foo: bar` is invalid YAML; the claim tooling (`bin/ag-claim`) parses the frontmatter with a real YAML parser and fails, so the spec can never be pulled. Prefer rewording the title with a dash or comma ("Foo — bar"); quoting the value also works. The same applies to `outcome:` and every other field, and to ADR frontmatter.

## House additions

Shaping is where Keith steers: the loop runs with **no human gates**, so a
spec must be precise enough for the builder and reviewer to ship it unattended.

- **Reviewer-checkable acceptance.** Every acceptance criterion must be something
  the `ag-reviewer` can verify without a person: a test, a grep, a launched app,
  or a fixture PNG to look at. "Looks beautiful" needs a concrete stand-in
  (which theme, which fixture, what must be visible).
- **Theme inputs.** Which files under `~/.local/state/omarchy/current/theme/` does
  this read (`colors.toml`, `zed-theme.json`, `vscode.json`)? Which keys?
- **Editors affected.** Zed, VS Code, or the generic path — and what happens for
  the others.
- **Visual fixture.** Which fixture in `tests/fixtures/` (language + theme pair)
  demonstrates the change, and what should the saved PNG show?
- **Dependencies and vendoring.** Any new library or grammar: pacman package or
  vendored file? Nothing fetched at runtime.
- **Speed.** Does this touch the binding-to-preview path? Keep it under about a
  second.
- **Rollback.** Ship is unattended; how is this turned off or reverted if it
  misbehaves?
