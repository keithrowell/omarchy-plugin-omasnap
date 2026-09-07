import { test } from "node:test";
import assert from "node:assert/strict";
import { EDITORS, detectEditorContext } from "../lib/editors/registry.mjs";

test("EDITORS: other is last, and every adapter has the full interface", () => {
  assert.equal(EDITORS[EDITORS.length - 1].id, "other");
  for (const editor of EDITORS) {
    assert.equal(typeof editor.id, "string");
    assert.equal(typeof editor.detect, "function");
    assert.equal(typeof editor.resolveSelection, "function");
    assert.equal(typeof editor.highlight, "function");
    assert.equal(typeof editor.font, "function");
    assert.equal(typeof editor.filenameFromTitle, "function");
  }
});

test("detectEditorContext: a Zed window class matches the zed adapter", async () => {
  const { editor } = await detectEditorContext({ windowClass: "dev.zed.Zed" });
  assert.equal(editor.id, "zed");
});

test("detectEditorContext: a VS Code window class matches the vscode adapter", async () => {
  const { editor } = await detectEditorContext({ windowClass: "code" });
  assert.equal(editor.id, "vscode");
});

test("detectEditorContext: a terminal class with no pid never matches neovim, falls to other", async () => {
  const { editor } = await detectEditorContext({ windowClass: "foot" });
  assert.equal(editor.id, "other");
});

test("detectEditorContext: an unrecognised class always falls through to other", async () => {
  const { editor, context } = await detectEditorContext({ windowClass: "some-random-app" });
  assert.equal(editor.id, "other");
  assert.deepEqual(context, {});
});
