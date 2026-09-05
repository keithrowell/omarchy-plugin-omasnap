# Renders — relative-indent

Evidence for the acceptance criterion: "One render fixture whose lines all
start with a deep indent, re-rendered to show the flush-left result."

`deep.js` is eight lines of JavaScript, every line indented six tabs deep
(as if carved out of several nested blocks), with one nested `for` body
indented two tabs deeper still (eight tabs). Both renders go through the
same `prepareSnap` the live CLI (`lib/snap.mjs`) calls — the fixture render
path (`--fixture`) is out of this spec's scope, since fixtures are already
resolved token spans and never see `dedent` at all.

## Commands

`lib/snap.mjs`'s CLI has no flag to bypass `dedent` (there's no reason it
should ship one), so the "before" render — dedent bypassed, to show what
the frame looked like before this spec — uses a one-off script,
`build-input.mjs`, that calls `prepareSnap` directly with a no-op
`dedentFn` and writes the same input JSON shape `lib/snap.mjs`'s
`writeInput` does. The "after" render calls `prepareSnap` the normal way
(real `dedent`, its default). Both then go through the same headless
`qs` render mode `bin/omasnap --fixture` uses.

```bash
# From the repo root, after `bin/build-grammars`:

node docs/agentile/specs/0002-relative-indent/renders/build-input.mjs \
  --mode before --out /tmp/deep-indent-before-input.json
OMASNAP_INPUT=/tmp/deep-indent-before-input.json \
  OMASNAP_OUT=docs/agentile/specs/0002-relative-indent/renders/deep-indent-before.png \
  qs -p app/Main.qml

node docs/agentile/specs/0002-relative-indent/renders/build-input.mjs \
  --mode after --out /tmp/deep-indent-after-input.json
OMASNAP_INPUT=/tmp/deep-indent-after-input.json \
  OMASNAP_OUT=docs/agentile/specs/0002-relative-indent/renders/deep-indent-after.png \
  qs -p app/Main.qml
```

Both renders use `tests/fixtures/themes/gruvbox-dark/theme` (same fixture
theme `tests/snap.test.mjs` uses) so they're reproducible without a live
Omarchy theme, and `--language javascript` (a fake `{}` window gives editor
`"other"`, so there's no title to detect a language from).

## Files

| File | What it shows |
|---|---|
| `deep.js` | The fixture: 8 lines, 6 tabs of dead indent, one nested block 2 tabs deeper. |
| `build-input.mjs` | One-off script building each render's input JSON (not part of the shipped module). |
| `deep-indent-before.png` | `dedent` bypassed: every line sits ~24 columns in (six tabs), all the way to the frame's right edge for the longest line — the dead indent this spec removes. |
| `deep-indent-after.png` | Normal `prepareSnap`: line 1 (`function sum(items) {`) sits flush left at column one; the nested `for` body (`total += item;`) keeps its 2-tab (8-column, at this app's 4-space tab width) indent relative to it. `detected.removedIndent` is `"\t\t\t\t\t\t"` (six tabs). |

## What to check against the acceptance criteria

Compare the two images: the shallowest line (`function sum(items) {`) moves
from deep in the frame to column one; the nested block's *relative* indent
(one extra level) is unchanged between the two; nothing else about the
frame (theme colours, chrome, filename header) differs.
