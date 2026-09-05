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
 * Strip `commonIndent`'s result from every line of `text`, returning
 * `{ text, removed }` (`removed` is the stripped prefix, kept for callers
 * that want to report it or, someday, offer a "show absolute indent"
 * toggle). Line endings are preserved (a `\r` before a `\n` is never
 * treated as indent, and is never stripped). A blank/whitespace-only line
 * becomes an empty line (keeping its own `\r` if it had one) — but only
 * when something was actually removed: when the common prefix is empty
 * (nothing shared, e.g. a mid-line-start selection, or a tabs-vs-spaces
 * mismatch), `text` is returned unchanged.
 */
export function dedent(text) {
  if (text === "") return { text: "", removed: "" };

  const lines = text.split("\n");
  const removed = commonIndent(lines);
  if (removed === "") return { text, removed: "" };

  const stripped = lines.map((line) => {
    if (isBlank(line)) return line.endsWith("\r") ? "\r" : "";
    return line.slice(removed.length);
  });

  return { text: stripped.join("\n"), removed };
}
