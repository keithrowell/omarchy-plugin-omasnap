import { test } from "node:test";
import assert from "node:assert/strict";
import { commonIndent, dedent } from "../lib/indent.mjs";

test("mixed depths with tabs: the shallowest line's tabs are the common prefix", () => {
  const result = dedent("\t\tfoo\n\t\t\tbar\n\t\tbaz");
  assert.equal(result.text, "foo\n\tbar\nbaz");
  assert.equal(result.removed, "\t\t");
});

test("mixed depths with spaces: 4 and 8 spaces share a 4-space common prefix", () => {
  const result = dedent("    foo\n        bar");
  assert.equal(result.text, "foo\n    bar");
  assert.equal(result.removed, "    ");
});

test("a blank line in the middle stays an empty line and does not affect the common prefix", () => {
  const result = dedent("\t\tfoo\n\n\t\tbar");
  assert.equal(result.text, "foo\n\nbar");
  assert.equal(result.removed, "\t\t");
});

test("a whitespace-only line becomes empty and is not counted toward the common prefix", () => {
  const result = dedent("\t\tfoo\n      \n\t\tbar");
  assert.equal(result.text, "foo\n\nbar");
  assert.equal(result.removed, "\t\t");
});

test("a single line: its own leading whitespace is removed", () => {
  const result = dedent("    x");
  assert.equal(result.text, "x");
  assert.equal(result.removed, "    ");
});

test("no common prefix at all: unchanged, nothing removed", () => {
  const result = dedent("a\n  b");
  assert.equal(result.text, "a\n  b");
  assert.equal(result.removed, "");
});

test("a tabs-vs-spaces mismatch at position 0: unchanged, nothing removed", () => {
  const result = dedent("\tfoo\n  bar");
  assert.equal(result.text, "\tfoo\n  bar");
  assert.equal(result.removed, "");
});

test("removed is reported correctly for a mixed space-then-tab prefix shared by every line", () => {
  const result = dedent(" \tfoo\n \tbar");
  assert.equal(result.text, "foo\nbar");
  assert.equal(result.removed, " \t");
});

test("CRLF: the \\r is not indent and is preserved; a \\r-only line is blank", () => {
  const result = dedent("\t\tfoo\r\n\t\tbar\r\n");
  assert.equal(result.text, "foo\r\nbar\r\n");
  assert.equal(result.removed, "\t\t");
});

test("empty string: returns empty, unchanged", () => {
  const result = dedent("");
  assert.deepEqual(result, { text: "", removed: "" });
});

// --- line 1 clipped by a mid-line selection start -------------------------

test("line 1 with no indent at all, but 2+ agreeing body lines: the agreement wins, everything ends up flush", () => {
  const result = dedent("foo\n    bar\n    baz\n    qux");
  assert.equal(result.text, "foo\nbar\nbaz\nqux");
  assert.equal(result.removed, "    ");
});

test("line 1 with some indent, shorter than 2+ agreeing deeper body lines: line 1's shorter amount is all it loses", () => {
  const result = dedent("  foo\n    bar\n    baz");
  assert.equal(result.text, "foo\nbar\nbaz");
  assert.equal(result.removed, "    ");
});

test("a lone deeper body line does NOT count as agreement: relative nesting is kept, not flattened", () => {
  // Same shape as the "mixed depths with spaces" case above, restated here
  // to document the boundary this heuristic deliberately does not cross:
  // one body line agreeing with nothing looks exactly like a genuine
  // header/body pair (`if x:` above `  return 1`), so it still curbs the
  // strip the ordinary way instead of assuming line 1 was clipped.
  const result = dedent("foo\n    bar");
  assert.equal(result.text, "foo\n    bar");
  assert.equal(result.removed, "");
});

test("blank lines in the body don't count toward the 2-line agreement threshold", () => {
  const result = dedent("foo\n\n    bar");
  assert.equal(result.text, "foo\n\n    bar");
  assert.equal(result.removed, "");
});

test("a tabs-vs-spaces mismatch between line 1 and an agreeing body: line 1 is left alone, the body still dedents", () => {
  const result = dedent("\tfoo\n    bar\n    baz");
  assert.equal(result.text, "\tfoo\nbar\nbaz");
  assert.equal(result.removed, "    ");
});

// --- commonIndent --------------------------------------------------------

test("commonIndent: ignores blank lines and stops at the first disagreement", () => {
  assert.equal(commonIndent(["\t\tfoo", "", "\t\t\tbar"]), "\t\t");
  assert.equal(commonIndent(["a", "  b"]), "");
  assert.equal(commonIndent([]), "");
  assert.equal(commonIndent(["   ", "\t"]), "");
});
