---
max_iterations: 5          # items per /ag-loop invocation — a runaway guard
pause_before_ship: false   # no human gates — ship to trunk once verify passes (Keith, 2026-09-05)
pause_at_plan: never       # no human gates — plans are reviewed by the reviewer, not a person
stop_on_gate_failure: true # halt/pause on a failing gate rather than continuing
verify_retry_limit: 2      # two bounces before halting, since nobody is watching
on_empty: watch            # under /loop, an empty backlog: watch (keep waiting) | stop (end the loop)
watch: self-paced          # how to wait when idle: self-paced | a fixed interval like 10m
---

# Loop policy

How this project wants `/ag-loop` to behave. There are two pause knobs —
`pause_at_plan` (steering, before code) and `pause_before_ship` (the final
gate) — and the runner also honours every per-stage `human_checkpoint: true`
regardless of these settings.

- `/ag-loop` alone drains the ready backlog then stops.
- `/loop /ag-loop` drains and then watches — waiting for new ready work and
  starting on it as it appears. `on_empty` and `watch` only apply under `/loop`.
- `pause_at_plan: route` pauses after `plan.md` is written when the spec's
  `route` is `foreground` or `spike` — the cheapest place to steer. Review or
  amend `plan.md` in place, then reply "approved". `background` specs run
  through without a plan pause.

## This project: no human gates

Keith chose **no human gates at all**. The loop plans, builds, verifies and
ships to `master` without waiting for a person. What replaces the human read:

- The deterministic gates in `gates.json` (tests must pass).
- The fresh-context `ag-reviewer` applying `verify.md` — the only "read of the
  diff" before merge, so `verify.md` is deliberately strict.
- Ship is small and reversible: one spec per merge, trunk always launchable.
- `stop_on_gate_failure: true` still halts the loop on a failing verify past
  the retry limit — a stuck item waits for a human rather than being skipped.

Steering happens **upstream**: in the brief, in `/ag-shape` (the house
questions in `shape.md`), and in `/ag-prioritise`. If a shipped spec turns out
wrong, capture a stub referencing it, shape the fix, let the loop ship it.
