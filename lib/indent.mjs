// Relative indent: strips a selection's common leading whitespace so the
// shallowest line sits flush left while deeper lines keep their extra
// indent relative to it. Code carved out of the middle of a file carries
// its absolute indent (e.g. six tabs, from sitting inside several nested
// blocks) — that's meaningless once the selection stands alone.
//
// Pure ES module: no I/O, no Qt, no dependency on tab width. Tabs and
// spaces are compared character-wise and never converted into one
// another — a tab is never "worth" N spaces here.

/** A line (with any trailing `\r` still attached) is blank if it is empty or made up only of spaces/tabs. */
function isBlank(line) {
  const withoutCR = line.endsWith("\r") ? line.slice(0, -1) : line;
  return /^[ \t]*$/.test(withoutCR);
}

/** The leading run of spaces/tabs at the start of a line. */
function leadingWhitespace(line) {
  return /^[ \t]*/.exec(line)[0];
}

/** The longest common leading run shared by two leading-whitespace strings, character-wise. */
function sharedPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/**
 * The longest common leading-whitespace **string** shared by every
 * non-blank line in `lines`, character-wise: `"\t "` and `" \t"` share no
 * prefix at all, and a run stops the moment two lines disagree at some
 * position (so a tab is never confused with N spaces). Blank/whitespace-only
 * lines are ignored — they never shrink or empty the common prefix. `""`
 * when there are no non-blank lines, when some non-blank line has no
 * leading whitespace at all, or when the leading runs disagree from the
 * very first character.
 */
export function commonIndent(lines) {
  let prefix = null;
  for (const line of lines) {
    if (isBlank(line)) continue;
    const lead = leadingWhitespace(line);
    prefix = prefix === null ? lead : sharedPrefix(prefix, lead);
    if (prefix === "") break;
  }
  return prefix ?? "";
}

/**
 * Strip a common leading whitespace from `text`, returning `{ text,
 * removed }` (`removed` is the prefix stripped from every line but
 * possibly line 1 — see below — kept for callers that want to report it
 * or, someday, offer a "show absolute indent" toggle). Line endings are
 * preserved (a `\r` before a `\n` is never treated as indent, and is
 * never stripped). A blank/whitespace-only line becomes an empty line
 * (keeping its own `\r` if it had one).
 *
 * Line 1 is treated specially. A mouse-drag selection almost never starts
 * at column 0 of its first line — the user clicks on the first word, not
 * the space before it — so line 1's leading whitespace is frequently
 * *missing*, not *absent by design*, in a way no other line's can be:
 * every other line is either wholly inside the selection (whitespace
 * intact) or is the last line, whose *trailing* content may be clipped
 * but whose leading whitespace never is. When two or more of those other
 * lines agree on an indent deeper than including line 1 would allow,
 * that agreement is trusted over line 1's shorter (or absent) one: the
 * agreed indent is stripped from every line but 1, which only loses
 * whatever prefix of it line 1 actually has (often nothing, if line 1
 * has no leading whitespace left at all).
 *
 * This is a deliberate, imperfect trade-off, not a special case that
 * could be "fixed" to be exact: nothing in the text says whether line 1
 * is a clipped continuation of the block below it or a genuinely
 * shallower header line above an indented body (`if x:` above `  return
 * 1`) — the two are indistinguishable from the characters alone. A
 * *lone* deeper body line does not trigger this — one line agreeing with
 * nothing is exactly the header/body shape, so it still curbs the strip
 * the ordinary way (`"    foo\n        bar"` keeps `bar` one level under
 * `foo`, not flush) — only corroboration from two or more independent
 * lines is treated as evidence line 1 is the odd one out.
 */
export function dedent(text) {
  if (text === "") return { text: "", removed: "" };

  const lines = text.split("\n");
  if (lines.length === 1) {
    const removed = commonIndent(lines);
    if (removed === "") return { text, removed: "" };
    return { text: lines[0].slice(removed.length), removed };
  }

  const [first, ...body] = lines;
  const wholeIndent = commonIndent(lines);
  const bodyIndent = commonIndent(body);
  const bodyAgreesDeeper = body.filter((line) => !isBlank(line)).length >= 2 && bodyIndent.length > wholeIndent.length;

  const removed = bodyAgreesDeeper ? bodyIndent : wholeIndent;
  if (removed === "") return { text, removed: "" };
  const firstStrip = bodyAgreesDeeper ? sharedPrefix(leadingWhitespace(first), bodyIndent) : removed;

  const stripLine = (line, amount) => {
    if (isBlank(line)) return line.endsWith("\r") ? "\r" : "";
    return line.slice(amount.length);
  };

  const strippedFirst = stripLine(first, firstStrip);
  const strippedBody = body.map((line) => stripLine(line, removed));

  return { text: [strippedFirst, ...strippedBody].join("\n"), removed };
}
