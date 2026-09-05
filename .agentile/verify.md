---
# No human_checkpoint: the reviewer is the last read before merge (see loop.md).
---

# Verify — this project's Definition of Done

There is no human review before ship, so the reviewer holds the line. Fail the
gate unless **all** of these hold:

1. **Gates pass.** `node --test tests/*.test.mjs` is green, and every new or
   changed `lib/` module has tests for its behaviour, not just its existence.
2. **Spec met, nothing more.** Each acceptance criterion in `SPEC.md` is
   demonstrably satisfied; scope beyond the spec is called out and rejected.
3. **No hard-coded colours.** `grep -rnE '#[0-9a-fA-F]{6}' app lib` returns
   only theme-parsing code or fixture data. Anything else fails.
4. **No Qt in `lib/`.** `grep -rn 'import Qt\|Qt\.' lib` is empty.
5. **No runtime network or npm.** No `npm install`, `fetch`, or `curl` on the
   run path; vendored assets are committed.
6. **It launches.** `qs -p app/Main.qml` starts without QML errors when the
   app exists (check the Quickshell log). For rendering changes, view the
   fixture PNG the builder saved: the frame reads as Omarchy (theme colours,
   no traffic lights), and highlighted tokens match the editor theme's
   `syntax` / `tokenColors` for the fixture language.
7. **Theme switch safe.** Nothing caches theme values across runs.
8. **Security skim.** Selection text is treated as data: it must never be
   passed to a shell, evaluated, or written anywhere except the rendered
   image and the chosen output file.
9. **Trunk stays shippable.** The branch merges cleanly onto `master`.
