---
title: Re-highlight from the language selector must not depend on files the launcher has deleted
slug: rehighlight-self-contained-request
status: shipped
shipped_at: 2026-09-07T05:54:01Z
depends_on: []
type: bug
route: foreground
business_value: high
technical_certainty: high
created: 2026-09-07
outcome: after a real SUPER+ALT+SHIFT+S snap, picking a different language in the preview (popup or Left/Right) redraws the image instead of notifying "Re-highlight failed"
claimed_by:
label:
claimed_at:
---

# Re-highlight from the language selector must not depend on files the launcher has deleted

## Problem / why now

The preview's language selector (spec 0006) re-runs `node lib/snap.mjs
--request F --language X --out F`. The request JSON written by the first run
records only *paths* to the selection text and the `hyprctl activewindow`
JSON. `bin/omasnap` narrows its EXIT trap after the IPC handoff to
`rm -f "$SELECTION" "$WINDOW"` — exactly the two files the re-highlight
reads — so every live re-highlight fails with ENOENT and the user sees
"Re-highlight failed (see terminal)". Reproduced 2026-09-07 by generating a
request, deleting the selection file, and re-running: `snap: ENOENT: no such
file or directory, open '.../selection.txt'`, exit 1. With the file present
the same command succeeds, including under the shell service's PATH. The
`OMASNAP_AUTO=lang:<id>` test hook never caught it because it calls the IPC
target directly, bypassing the launcher and its trap.

Keith hit this the first time he tried the override, which is also the only
escape hatch for a wrong detection (the python-in-a-markdown-file case).

## Acceptance criteria

- [x] `lib/snap.mjs` writes the selection text and the window info into the
      request JSON itself, so a `--request` re-highlight needs nothing but
      the request file (owned and cleaned up by `app/Service.qml`).
- [x] Re-highlighting from `--request` succeeds after the selection and
      window files recorded by the first run have been deleted (CLI test).
- [x] Re-highlight mode still honours `--language plain` and a language id,
      and still resolves `root` from the request as today.
- [x] `bin/omasnap`'s trap comment describes the new ownership accurately
      (the launcher owns SELECTION/WINDOW for its own lifetime only; the
      request carries what the overlay needs).
- [x] All tests pass; a live snap followed by a language change redraws.

## Scope boundary

**In scope:** the request JSON's contents and the re-highlight reader in
`lib/snap.mjs`; the trap comment in `bin/omasnap`; tests in
`tests/snap.test.mjs`.

**Out of scope:** the IPC signature (six arguments stays), `app/Service.qml`
cleanup, `app/Overlay.qml`, any change to language detection (separate inbox
stub, captured 2026-09-07).

## Edge cases and failure paths

- A request file from before this change (paths only, no inline text):
  ephemeral per-run files, so no migration is needed; the reader may fall
  back to the recorded paths if the inline text is absent, but must not
  require the paths.
- The request file is 0600 under a 0700 runtime dir (launcher's `umask 077`
  is inherited by node), so inlining the selection text changes nothing
  about exposure — the selection file it replaces had the same protection.
- The re-highlight exit path (`exit 1`, message on stderr) is unchanged;
  the overlay's "Re-highlight failed" notification remains the fallback.

## Affected areas

`lib/snap.mjs` (request writer and re-highlight reader), `bin/omasnap`
(comments only), `tests/snap.test.mjs`.

## Open questions

None.

## Verification

- New CLI test: first run, then `rm` the selection and window files, then
  `--request --language python` succeeds and `snap.language === "python"`.
- `node --test tests/*.test.mjs` green.
- Live: snap from Zed, click the language button, pick another language;
  the image redraws and the header's language label changes.
