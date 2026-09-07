import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTheme, vscodeScopeStyle } from "../lib/theme.mjs";
import { highlight, REPO_ROOT } from "../lib/highlight/vscode.mjs";
import { buildGrammarIndex } from "../lib/vscode-extensions.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_ROOT = join(ROOT, "tests", "fixtures", "vscode-extensions", "app-root");
const GRUVBOX = readTheme(join(ROOT, "tests", "fixtures", "themes", "gruvbox-dark", "theme"));
const FLEXOKI = readTheme(join(ROOT, "tests", "fixtures", "themes", "flexoki-light", "theme"));

function indexOf(...roots) {
  return buildGrammarIndex(roots);
}

test("highlight(): json — a string key and a boolean value get different, theme-correct colours", async () => {
  const text = '{\n  "name": true,\n  "count": "x"\n}';
  const result = await highlight({ text, language: "json", theme: GRUVBOX, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  assert.ok(result, "expected a real tokenized result, not a null fallback");
  assert.equal(result.warnings.length, 0);

  // Scope stacks confirmed against the fixture grammar's real tokenizeLine
  // output (JSON's `dictionary` rule nests a key's own text under
  // `meta.structure.dictionary.json` > `string.json` > `support.type.property-name.json`).
  const keyColor = vscodeScopeStyle(GRUVBOX.vscode, [
    "source.json",
    "meta.structure.dictionary.json",
    "string.json",
    "support.type.property-name.json",
  ]).color;
  const boolColor = vscodeScopeStyle(GRUVBOX.vscode, [
    "source.json",
    "meta.structure.dictionary.json",
    "meta.structure.dictionary.value.json",
    "constant.language.json",
  ]).color;
  const stringValueColor = vscodeScopeStyle(GRUVBOX.vscode, [
    "source.json",
    "meta.structure.dictionary.json",
    "meta.structure.dictionary.value.json",
    "string.quoted.double.json",
  ]).color;

  const keySpan = result.lines[1].find((s) => s.text.includes("name"));
  const boolSpan = result.lines[1].find((s) => s.text.includes("true"));
  const stringSpan = result.lines[2].find((s) => s.text.includes("x"));
  assert.equal(keySpan.color, keyColor);
  assert.equal(boolSpan.color, boolColor);
  assert.equal(stringSpan.color, stringValueColor);
  assert.notEqual(keyColor, stringValueColor);
});

test("highlight(): every character of every line is covered by some span (coverage invariant)", async () => {
  const text = '{\n  "name": 42,\n  "ok": true\n}';
  const result = await highlight({ text, language: "json", theme: GRUVBOX, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  const lines = text.split("\n");
  result.lines.forEach((spans, i) => {
    assert.equal(spans.map((s) => s.text).join(""), lines[i]);
  });
});

test("highlight(): adjacent spans that resolve to the same style are merged", async () => {
  const text = "{}";
  const result = await highlight({ text, language: "json", theme: GRUVBOX, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  const line = result.lines[0];
  for (let i = 1; i < line.length; i++) {
    assert.notEqual(
      `${line[i - 1].color}|${line[i - 1].fontStyle}|${line[i - 1].fontWeight}`,
      `${line[i].color}|${line[i].fontStyle}|${line[i].fontWeight}`,
    );
  }
});

test("highlight(): the same fixture under a different theme yields a different colour", async () => {
  const text = '{ "a": 1 }';
  const gruvbox = await highlight({ text, language: "json", theme: GRUVBOX, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  const flexoki = await highlight({ text, language: "json", theme: FLEXOKI, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  const g = gruvbox.lines[0].find((s) => s.text.includes("a"));
  const f = flexoki.lines[0].find((s) => s.text.includes("a"));
  assert.notEqual(g.color, f.color);
});

test("highlight(): javascript — a grammar dependency (source.js.regexp) resolves through the same index", async () => {
  const text = "const re = /abc/g;";
  const result = await highlight({ text, language: "javascript", theme: GRUVBOX, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  assert.ok(result);
  assert.ok(result.lines[0].some((s) => s.text.includes("abc")));
});

test("highlight(): multi-line rule stack threads across lines (an open block comment stays a comment on line 2)", async () => {
  const text = "/* start\n   still inside */\nconst x = 1;";
  const result = await highlight({ text, language: "javascript", theme: GRUVBOX, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  const commentColor = vscodeScopeStyle(GRUVBOX.vscode, ["source.js", "comment.block.js"]).color;
  const line2 = result.lines[1];
  assert.ok(line2.every((s) => s.color === commentColor));
});

test("highlight(): no vscode-theme.json -> null", async () => {
  const noVscode = { ...GRUVBOX, vscode: null };
  const result = await highlight({ text: "{}", language: "json", theme: noVscode, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  assert.equal(result, null);
});

test("highlight(): a language with no LANGUAGE_TO_VSCODE_ID entry -> null", async () => {
  const result = await highlight({ text: "x", language: "elixir", theme: GRUVBOX, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  assert.equal(result, null);
});

test("highlight(): a language in the map but nothing installed provides its grammar (rust) -> null", async () => {
  const result = await highlight({ text: "fn main() {}", language: "rust", theme: GRUVBOX, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  assert.equal(result, null);
});

test("highlight(): a null language -> null (caller falls back)", async () => {
  const result = await highlight({ text: "x", language: null, theme: GRUVBOX, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  assert.equal(result, null);
});

test("highlight(): REPO_ROOT points at this checkout's vendor directory", () => {
  assert.equal(REPO_ROOT, resolve(ROOT));
});

test("highlight(): a 60-line JSON fixture highlights well under a second", async () => {
  const text = JSON.stringify({ items: Array.from({ length: 60 }, (_, i) => ({ id: i, name: `item-${i}`, ok: i % 2 === 0 })) }, null, 2);
  const start = process.hrtime.bigint();
  const result = await highlight({ text, language: "json", theme: GRUVBOX, grammarIndex: indexOf(APP_ROOT), activeVscodeTheme: null });
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(result);
  assert.ok(ms < 1000, `expected under 1000ms, got ${ms}ms`);
});
