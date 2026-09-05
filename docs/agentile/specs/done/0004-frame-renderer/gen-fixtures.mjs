#!/usr/bin/env node
// Builder-side helper for spec 0004: generates
// tests/fixtures/render/{hello,long}.json from plain source text, so the
// hand-authored fixtures don't require manually computing span offsets.
// Not part of lib/ or the shipped tests — a one-off tool, run once and its
// output (the two fixture JSON files) is what's committed and tested.
//
// Usage: node docs/agentile/specs/0004-frame-renderer/gen-fixtures.mjs

import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFixture } from "../../../../lib/input.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const OUT_DIR = join(ROOT, "tests", "fixtures", "render");

function mk(text, capture) {
  return capture ? { text, capture } : { text };
}

// --- hello.js: hand-tokenised, span-by-span (short enough to write directly) ---

const helloLines = [
  [mk("// Greet someone by name.", "comment")],
  [
    mk("function", "keyword"), mk(" "), mk("greet", "function"), mk("(", "punctuation.bracket"),
    mk("name", "variable"), mk(")", "punctuation.bracket"), mk(" "), mk("{", "punctuation.bracket"),
  ],
  [
    mk("  "), mk("const", "keyword"), mk(" "), mk("message", "variable"), mk(" "), mk("=", "operator"), mk(" "),
    mk("`Hello, ", "string"), mk("${", "punctuation.special"), mk("name", "variable"), mk("}", "punctuation.special"),
    mk("!`", "string"), mk(";", "punctuation.delimiter"),
  ],
  [
    mk("  "), mk("const", "keyword"), mk(" "), mk("times", "variable"), mk(" "), mk("=", "operator"), mk(" "),
    mk("3", "number"), mk(" "), mk("+", "operator"), mk(" "), mk("4", "number"), mk(";", "punctuation.delimiter"),
  ],
  [
    mk("  "), mk("console", "variable"), mk(".", "punctuation.delimiter"), mk("log", "function"),
    mk("(", "punctuation.bracket"), mk("message", "variable"), mk(".", "punctuation.delimiter"),
    mk("length", "property"), mk(",", "punctuation.delimiter"), mk(" "), mk("times", "variable"),
    mk(")", "punctuation.bracket"), mk(";", "punctuation.delimiter"),
  ],
  [mk("  "), mk("return", "keyword"), mk(" "), mk("message", "variable"), mk(";", "punctuation.delimiter")],
  [mk("}", "punctuation.bracket")],
  [mk("")],
  [
    mk("greet", "function"), mk("(", "punctuation.bracket"), mk('"World"', "string"),
    mk(")", "punctuation.bracket"), mk(";", "punctuation.delimiter"),
  ],
];

const hello = {
  filename: "hello.js",
  language: "javascript",
  editor: "zed",
  font: { family: "JetBrainsMono Nerd Font", size: 13 },
  lines: helloLines,
};

// --- long.py: 40 lines, generic tokeniser (good enough for fixture data) ---

const KEYWORDS = new Set([
  "def", "class", "import", "from", "return", "if", "else", "elif", "for", "while", "with", "as", "in", "is",
  "not", "and", "or", "pass", "break", "continue", "yield", "lambda", "try", "except", "finally", "raise",
  "global", "nonlocal", "assert", "del",
]);
const CONSTANT_WORDS = new Set(["None", "True", "False"]);

function tokenizeLine(line) {
  const spans = [];
  let rest = line;

  if (rest.startsWith("@")) {
    const m = /^@[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (m) {
      spans.push(mk(m[0], "attribute"));
      rest = rest.slice(m[0].length);
    }
  }

  while (rest.length > 0) {
    let m;
    if ((m = /^(?:"""[\s\S]*?"""|'''[\s\S]*?''')/.exec(rest))) {
      spans.push(mk(m[0], "string.doc"));
    } else if ((m = /^f?"(?:[^"\\]|\\.)*"|^f?'(?:[^'\\]|\\.)*'/.exec(rest))) {
      spans.push(mk(m[0], "string"));
    } else if ((m = /^#.*/.exec(rest))) {
      spans.push(mk(m[0], "comment"));
    } else if ((m = /^\s+/.exec(rest))) {
      spans.push(mk(m[0]));
    } else if ((m = /^\d+(?:\.\d+)?/.exec(rest))) {
      spans.push(mk(m[0], "number"));
    } else if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
      const word = m[0];
      const after = rest.slice(word.length);
      if (KEYWORDS.has(word)) spans.push(mk(word, "keyword"));
      else if (CONSTANT_WORDS.has(word)) spans.push(mk(word, "constant"));
      else if (after.startsWith("(")) spans.push(mk(word, "function"));
      else spans.push(mk(word, "variable"));
    } else if ((m = /^(?:->|==|!=|<=|>=|[=+\-*/%<>!&|^~])/.exec(rest))) {
      spans.push(mk(m[0], "operator"));
    } else if ((m = /^[()[\]{}]/.exec(rest))) {
      spans.push(mk(m[0], "punctuation.bracket"));
    } else if ((m = /^[,:;.]/.exec(rest))) {
      spans.push(mk(m[0], "punctuation.delimiter"));
    } else {
      m = [rest[0]];
      spans.push(mk(m[0]));
    }
    rest = rest.slice(m[0].length);
  }

  if (spans.length === 0) spans.push(mk(""));
  return spans;
}

const longSource = [
  '"""Pipeline utilities for the batch export job."""',
  "",
  "import json",
  "import logging",
  "from dataclasses import dataclass",
  "from typing import Iterable, Optional",
  "",
  "logger = logging.getLogger(__name__)",
  "",
  "DEFAULT_BATCH_SIZE = 100",
  "",
  "@dataclass",
  "class Record:",
  '    """A single row pulled from the source table."""',
  "    id: int",
  "    name: str",
  "    tags: list",
  "",
  "def load_records(path: str) -> list:",
  '    """Load records from a JSON file on disk."""',
  '    with open(path, "r") as handle:',
  "        data = json.load(handle)",
  "    return [Record(**row) for row in data]",
  "",
  "def chunk(records, size=DEFAULT_BATCH_SIZE):",
  "    batch = []",
  "    for record in records:",
  "        batch.append(record)",
  "        if len(batch) >= size:",
  "            yield batch",
  "            batch = []",
  "    if batch:",
  "        yield batch",
  "",
  "@retry(times=3, delay=1.0)",
  "def export_batch(batch, destination=None):",
  '    logger.info(f"exporting {len(batch)} records to {destination}")',
  "    return True",
  "",
  'LARGE_LOOKUP = {"a": 1, "b": 2, "c": 3, "d": 4, "e": 5, "f": 6, "g": 7, "h": 8, "i": 9, "j": 10, '
    + '"k": 11, "l": 12, "m": 13, "n": 14, "o": 15, "p": 16, "q": 17, "r": 18, "s": 19, "t": 20, '
    + '"u": 21, "v": 22, "w": 23, "x": 24, "y": 25, "z": 26}',
];

if (longSource.length !== 40) {
  throw new Error(`long.py source must be 40 lines, got ${longSource.length}`);
}
const longLineLength = longSource[longSource.length - 1].length;
if (longLineLength <= 200) {
  throw new Error(`long.py's long line must exceed 200 chars, got ${longLineLength}`);
}

const long = {
  filename: "pipeline.py",
  language: "python",
  editor: "zed",
  font: { family: "JetBrainsMono Nerd Font", size: 13 },
  lines: longSource.map((line) => (line === "" ? [mk("")] : tokenizeLine(line))),
};

for (const [name, fixture] of [["hello.json", hello], ["long.json", long]]) {
  // Every line's spans must reconstruct the original source exactly.
  const source = name === "hello.json" ? helloLines : longSource.map((_, i) => longSource[i]);
  fixture.lines.forEach((spans, i) => {
    const joined = spans.map((s) => s.text).join("");
    const expected = name === "hello.json" ? undefined : longSource[i];
    if (expected !== undefined && joined !== expected) {
      throw new Error(`${name} line ${i}: reconstructed "${joined}" !== source "${expected}"`);
    }
  });

  validateFixture(fixture);
  const path = join(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`wrote ${path} (${fixture.lines.length} lines)`);
}
