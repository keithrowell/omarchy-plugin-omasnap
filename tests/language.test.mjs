import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, detectLanguage } from "../lib/language.mjs";

test("every suffix in LANGUAGES maps to its id", () => {
  for (const [id, config] of Object.entries(LANGUAGES)) {
    for (const suffix of config.suffixes ?? []) {
      assert.equal(detectLanguage({ filename: `sample.${suffix}` }), id, `sample.${suffix}`);
    }
  }
});

test("every filename in LANGUAGES maps to its id", () => {
  for (const [id, config] of Object.entries(LANGUAGES)) {
    for (const filename of config.filenames ?? []) {
      assert.equal(detectLanguage({ filename }), id, filename);
    }
  }
});

test("suffix is case-insensitive", () => {
  assert.equal(detectLanguage({ filename: "SAMPLE.PY" }), "python");
  assert.equal(detectLanguage({ filename: "Sample.Rs" }), "rust");
});

test("suffix wins over a shebang that would suggest a different language", () => {
  const text = "#!/usr/bin/env node\nconsole.log(1)\n";
  assert.equal(detectLanguage({ filename: "script.py", text }), "python");
});

test("shebang detects the interpreter when there is no matching suffix", () => {
  assert.equal(detectLanguage({ filename: "script", text: "#!/usr/bin/env python3\nprint(1)\n" }), "python");
  assert.equal(detectLanguage({ filename: "script", text: "#!/bin/bash\necho hi\n" }), "bash");
  assert.equal(detectLanguage({ filename: "script", text: "#!/usr/bin/python\nprint(1)\n" }), "python");
  assert.equal(detectLanguage({ filename: "script", text: "#!/usr/bin/env node\nconsole.log(1)\n" }), "javascript");
  assert.equal(detectLanguage({ filename: "script", text: "#!/usr/bin/env ruby\nputs 1\n" }), "ruby");
  assert.equal(detectLanguage({ filename: "script", text: "#!/usr/bin/env lua\nprint(1)\n" }), "lua");
});

test("shebang alone (no filename) still detects", () => {
  assert.equal(detectLanguage({ text: "#!/bin/bash\necho hi\n" }), "bash");
});

test("no filename, no shebang, no text -> null", () => {
  assert.equal(detectLanguage({}), null);
  assert.equal(detectLanguage(), null);
});

test("an unknown filename with no shebang -> null", () => {
  assert.equal(detectLanguage({ filename: "README", text: "just some text\n" }), null);
  assert.equal(detectLanguage({ filename: "notes.txt", text: "just some text\n" }), null);
});

test("path with directories only uses the basename", () => {
  assert.equal(detectLanguage({ filename: "/home/keith/project/src/main.rs" }), "rust");
  assert.equal(detectLanguage({ filename: "C:\\Users\\keith\\PKGBUILD" }), "bash");
});

test("a dotfile with no further suffix is not mistaken for one (leading dot doesn't count)", () => {
  assert.equal(detectLanguage({ filename: ".bashrc" }), "bash");
  assert.equal(detectLanguage({ filename: ".gitignore" }), null);
});

test("javascript and tsx share the tsx grammar but have distinct query sets", () => {
  assert.equal(LANGUAGES.javascript.grammar, "tsx");
  assert.equal(LANGUAGES.tsx.grammar, "tsx");
  assert.notEqual(LANGUAGES.javascript.queries, LANGUAGES.tsx.queries);
});
