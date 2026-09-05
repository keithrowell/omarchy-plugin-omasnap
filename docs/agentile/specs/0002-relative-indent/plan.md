# Plan — Relative indent: strip the selection's common leading whitespace

Written by the plan stage. Small, pure, high-certainty: one new module,
one call site, tests, one evidence render.

## Files to touch

| File | Why |
|---|---|
| `lib/indent.mjs` (new) | `dedent(text) → { text, removed }`. |
| `tests/indent.test.mjs` (new) | The eight cases the spec lists, plus CRLF and empty. |
| `lib/snap.mjs` | `prepareSnap` calls `dedent` on the (already NUL-cleaned, not yet truncated) text before `MAX_LINES` truncation, language detection and highlighting; `detected.removedIndent` recorded for the report. |
| `tests/snap.test.mjs` | One `prepareSnap` case with a six-tab-indented selection asserting the highlighter received dedented text and the spans start at column one. |
| `docs/agentile/specs/0002-relative-indent/renders/` | `deep-indent-before.png` and `deep-indent-after.png` (+ `README.md` with the commands). |

## Environment facts

- `lib/snap.mjs` today: `cleanText` (NUL-stripped) → `split("\n")` →
  truncate to `MAX_LINES` → `detectLanguage` → `highlight`. Tabs are
  expanded later by `lib/input.mjs` (`expandLineTabs`, width 4) on the
  span text, so `dedent` must run on raw text with real tabs.
- The fixture render path (`--fixture`) takes token spans, so the evidence
  render uses the live path headlessly: `node lib/snap.mjs --selection F
  --window W --request R --out I` then `OMASNAP_INPUT=I OMASNAP_OUT=P qs -p
  app/Main.qml` (render mode grabs and quits). A fake window JSON `{}` gives
  editor "other"; use `--language javascript` for colours.

## Approach

### `lib/indent.mjs`

```js
export function commonIndent(lines)  // longest common leading run of [ \t] across non-blank lines, character-wise; "" if any non-blank line has none or if runs disagree at some position
export function dedent(text)         // → { text, removed }
```

- Split on `\n` (keep `\r` attached to the line so it is never treated as
  indent; the leading-whitespace scan matches only spaces and tabs).
- A line is blank if it is empty or consists only of spaces/tabs (and an
  optional trailing `\r`); blank lines are excluded from the common-prefix
  computation and become empty (`""`, or `"\r"` if they had one — preserve
  the line ending) in the output.
- `removed` = the common prefix string (may contain both tabs and spaces
  in whatever order they actually share); it is removed **only** when the
  line starts with it, which is guaranteed for non-blank lines by
  construction.
- Empty input → `{ text: "", removed: "" }`. Single line → its own leading
  whitespace is removed. Tabs-vs-spaces mismatch at position 0 → `""`.
- Pure; no I/O; no dependency on tab width.

### `lib/snap.mjs`

In `prepareSnap`, immediately after the NUL cleaning and before the line
count/truncation: `const { text: dedented, removed } = dedent(cleanText);`
then continue with `dedented`. Put `removedIndent: removed` into
`detected`. The CLI output JSON gains nothing else. The `--benchmark` path
inherits it.

### Tests

`tests/indent.test.mjs` — assert exact strings:
1. Mixed depths with tabs: `"\t\tfoo\n\t\t\tbar\n\t\tbaz"` → `"foo\n\tbar\nbaz"`, removed `"\t\t"`.
2. Mixed depths with spaces (4 and 8) → 4 removed.
3. Blank line in the middle stays an empty line; does not affect the prefix.
4. Whitespace-only line (`"      "`) → `""`, not counted.
5. Single line `"    x"` → `"x"`, removed `"    "`.
6. No common prefix (`"a\n  b"`) → unchanged, removed `""`.
7. Tabs vs spaces mismatch (`"\tfoo\n  bar"`) → unchanged, removed `""`.
8. `removed` reported correctly for a mixed prefix `" \t"` shared by all.
9. CRLF: `"\t\tfoo\r\n\t\tbar\r\n"` → `"foo\r\nbar\r\n"`; a `\r`-only line is blank.
10. Empty string → `{ text: "", removed: "" }`.

`tests/snap.test.mjs`: `prepareSnap` with an injected `highlightFn` that
records the text it receives; input six-tab-indented two-line selection;
assert the recorded text has no leading tabs on line 1 and one tab on line
2, and `detected.removedIndent === "\t".repeat(6)`.

### Evidence render

Write `renders/deep.js`: eight lines of JS all indented by six tabs with
one nested block (two more tabs). Render it twice with the headless live
path: once with `dedent` bypassed (`git stash`-free way: pass the text
through `lib/snap.mjs` at the parent commit via `git show master:lib/snap.mjs > /tmp/snap-before.mjs`? simpler: a tiny script under the spec dir that builds the input JSON with `prepareSnap` using a `dedent` no-op via an injected option — add an optional `dedentFn` parameter to `prepareSnap` defaulting to the real one, test-only) → `deep-indent-before.png`; and normally → `deep-indent-after.png`. Look at both: before shows the dead indent (six tabs = 24 columns of space), after is flush left with the nested block indented by two tabs.

## Test strategy

- Gate `test`: `node --test tests/*.test.mjs` (179 + new).
- Verify greps (rule 3/4) unchanged; no new subprocess.
- Rule 8: dedent is pure string handling of the selection; nothing leaves
  the process.
- Reviewer: the spec's manual check (select an indented block in Zed and
  snap) if the desktop is usable; otherwise the two renders and a
  `printf` selection through `bin/omasnap --benchmark` + `OMASNAP_AUTO=shot`.

## Risks and unknowns

- Language detection on dedented text: shebang detection looks at line 1,
  which is unaffected (a shebang has no indent). Fine.
- Very long selections: dedent is O(n) over characters; negligible.
- A selection whose first line is partial (mid-line start) has no common
  prefix → unchanged, as the spec wants.

## ADR

none.
