# Side-by-side — blocked, not completed

The plan calls for opening `tests/fixtures/code/sample.js` in Zed
(`zed -n <file>`), screenshotting the editor region, rendering the same
fixture through `lib/highlight/zed.mjs` + `bin/omasnap --fixture`, and
recording a five-token comparison table (keyword, string, comment, function
name, punctuation) here, with PNGs.

**This was attempted during the build and did not complete.** A Zed window
was opened on `sample.js` (confirmed via `hyprctl -j clients`: class
`dev.zed.Zed`, title `sample.js — sample.js`), but by the time a screenshot
was taken the desktop had locked (an `Enter Password` `hyprlock` prompt —
most likely an idle-timeout lock unrelated to this build, not something the
build triggered deliberately). No agent may attempt to unlock a session or
interact with a lock screen, so:

- No screenshot of Zed's actual rendering was captured.
- The opened Zed window **was** closed via
  `hyprctl dispatch 'hl.dsp.window.close({ window = "address:<addr>" })'`
  (the same dispatcher the spec 0002 spike used) before giving up on this
  check — confirmed gone via `hyprctl -j clients` afterward. The only other
  Zed window on the desktop (a pre-existing `omarchy_pacman` project window)
  was left untouched throughout.
- The desktop was re-checked twice more, later in the build, and was still
  locked both times; the check was not reattempted a third time to avoid
  repeatedly touching a live desktop session that isn't this build's to
  manage.

## What this blocks

`lib/highlight/zed.mjs`'s capture-precedence rule ("smallest range wins,
last pattern wins on a tie" — see that module's header) was decided from
static evidence instead of this screenshot: Zed's own `javascript` and
`python` `highlights.scm` files both, consistently, declare a generic
capture first (`@variable`, `@property`) and a specific override later on
the exact same node (`@function`, `@function.method`, `@function.builtin`,
`@function.definition`, `@constructor`), and a first-pattern-wins reading
makes every one of those resolve to the *less* meaningful capture — the
opposite of what a theme's own `syntax` map conventions are for. This is a
reasonable basis for the decision, but it is not the same as confirming it
against Zed's actual rendered pixels, which is what this document was
supposed to do. **The reviewer/ship stage should re-attempt this check**
once the desktop is unlocked, using the reproduction below, and update this
file with the real result (including flipping the precedence rule back to
first-pattern-wins if the screenshot disagrees with the static-evidence
call, per the plan's instruction).

## Second attempt (2026-09-06, ~01:28) — also blocked, and inconsistent

The coordinator reported the desktop unlocked (hyprlock not running as of
01:27) and asked for this check to be finished. Re-attempted the full
procedure:

- `zed -n <abs path to sample.js>` — opened cleanly, confirmed via
  `hyprctl -j clients` (class `dev.zed.Zed`, title `sample.js — sample.js`,
  address `0xaaab12147d50`, mapped, on workspace 6).
- `hyprctl layers` showed **no lock-screen layer at all** — only
  `omarchy-background` and `omarchy-bar` on the overlay/background levels.
  `pgrep hyprlock` and `ps aux | grep -i lock` found no lock process
  running. By every signal Hyprland's own IPC exposes, the session was not
  locked and the Zed window existed and was mapped.
- `grim -g "12,525 781x463" ...` (the exact geometry `hyprctl -j clients`
  reported for the window) nonetheless produced the **same** full-screen
  blurred "Enter Password" image as the first attempt — not Zed's editor,
  not any window content. A follow-up unconstrained `grim` (whole output)
  produced the identical image.

This is a direct contradiction: the compositor's own state (window list,
layer list, no lock process) says the desktop is interactive and Zed is
on-screen, but every pixel capture shows a password prompt. Two readings,
neither confirmed:

1. `grim` on this machine is reading from a different source than the
   Hyprland instance `hyprctl` is talking to (e.g. the physical seat is
   genuinely locked by something outside Hyprland's own layer-shell
   tracking, or a nested/second compositor is involved) — this would mean
   no image capture from here can ever show real window content while
   that's true, no matter what `hyprctl` reports.
2. Something about this sandboxed environment always returns a canned
   "locked" image, independent of real screen state.

Either way: **a screenshot showing an "Enter Password" prompt is treated
identically to an actual lock screen** — no attempt was made to interact
with it, work around it, or capture by another method. The Zed window that
was opened for this attempt was closed via
`hyprctl dispatch 'hl.dsp.window.close({ window = "address:0xaaab12147d50" })'`,
confirmed removed from `hyprctl -j clients` afterward; the pre-existing
`omarchy_pacman` Zed window was left untouched throughout. No screenshot
files from this attempt were kept (they showed only the password prompt,
not useful evidence, and were deleted rather than committed).

**This needs a human to check the actual physical/attached display**
before a third attempt is worth making — if `grim` structurally cannot see
real window content in this environment, no amount of retrying will
produce a different result, and the five-token pixel comparison this
document calls for may need to happen a different way entirely (e.g. a
human takes the screenshot and hands it back).

## Static verification (reviewer, spec 0005 review pass)

Two live-desktop attempts to screenshot Zed both failed for reasons outside
this build's control (see above) — the reviewer instead verified the
precedence rule **statically**, against Zed v1.18.1's actual source, rather
than by pixel comparison:

- **Files read:** `crates/language/src/buffer.rs` (`BufferChunks::next`),
  `crates/language/src/syntax_map.rs` (`SyntaxMapCaptures`), and
  `crates/syntax_theme/src/syntax_theme.rs` (`SyntaxTheme::highlight_id`,
  Zed's equivalent of this module's `zedSyntaxStyle`).
- **Conclusion:** `BufferChunks::next` pushes each capture it encounters,
  in `QueryCursor` order, onto a stack and reads `stack.last()` to decide
  the active highlight at a position — so for two captures on the exact
  same node, the *later*-encountered pattern wins (it's pushed after, and
  therefore sits on top); for a capture strictly nested inside another,
  the inner one's push (during its own, later, narrower span) shadows the
  outer one for exactly its own range, and popping it back off on exit
  reveals the outer one again. That is precisely "smallest range wins,
  last pattern wins on a tie" — the rule `spansFromCaptures` implements.
  `SyntaxTheme::highlight_id`'s own capture-name resolution walks the same
  longest-dot-prefix-first fallback chain `zedSyntaxStyle` does
  (`a.b.c` -> `a.b` -> `a`), confirming that half of the design too.
- **Replay:** the reviewer mechanically replayed Zed's algorithm (as read
  from the above) over roughly 30,000 captures — every fixture under
  `tests/fixtures/code/` plus a run over this repository's own source
  files — under three different themes, and found **zero colour
  differences** against what `spansFromCaptures` actually produces.

This is strong, mechanical evidence (reading Zed's own resolution logic and
replaying it at scale) that the precedence rule is correct, independent of
ever getting a real screenshot. **The rule stands as "smallest range wins,
last pattern wins on a tie"; no code change was made as a result of this
verification.**

## Human screenshot — still outstanding

The actual pixel-comparison acceptance criterion (open Zed, screenshot it,
sample five tokens, compare against this build's colours) remains
**unmet**. Two agent attempts both failed at the screenshot step for
reasons that look environmental, not fixable by retrying from here (see
the two attempts above). This still needs a human at the actual desk to
run the sequence below and fill in the table your reviewer would otherwise
have completed:

```bash
# 1. Open the fixture in Zed and find its window.
zed -n tests/fixtures/code/sample.js &
hyprctl -j clients | jq '.[] | select(.class=="dev.zed.Zed")'

# 2. Screenshot just that window, promptly (before LSP semantic
#    highlighting has a chance to recolour anything).
grim -g "$(hyprctl activewindow -j | jq -r '"\(.at[0]),\(.at[1]) \(.size[0])x\(.size[1])"')" \
  docs/agentile/specs/0005-zed-highlighter/zed-sample-js.png

# 3. Close only that window.
hyprctl dispatch 'hl.dsp.window.close({ window = "address:<addr>" })'

# 4. Render the same fixture through this build's highlighter + frame.
node -e '
  const { readTheme } = require("./lib/theme.mjs");
  const { highlight } = require("./lib/highlight/zed.mjs");
  // build a fixture JSON from highlight() output, matching
  // tests/fixtures/render/*.json shape
'
bin/omasnap --fixture <that fixture>.json --out docs/agentile/specs/0005-zed-highlighter/omasnap-sample-js.png

# 5. Sample five tokens' pixel colours with ImageMagick (a thick stroke,
#    not an anti-aliased edge — small deltas are expected and fine):
magick docs/agentile/specs/0005-zed-highlighter/zed-sample-js.png \
  -format '%[pixel:p{X,Y}]' info:
```

Fill in: token, capture, this build's colour, Zed's sampled colour, match
(y/n) — for a keyword, a string, a comment, a function name, and
specifically `console.log`'s `log` (the exact property-vs-function.method
tie that motivated the precedence rule in the first place). Update this
file with the real result, and flip the precedence rule (re-run
`node --test tests/*.test.mjs` after) if Zed's actual pixels disagree with
it on any of the five.

(The at-the-desk command sequence to complete this is in the "Human
screenshot — still outstanding" section above; this note used to duplicate
it with slightly different, now-superseded paths — removed to avoid the
two drifting apart.)
