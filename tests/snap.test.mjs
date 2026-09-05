import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectEditor, filenameFromTitle, prepareSnap, MAX_LINES, EDITOR_CLASSES } from "../lib/snap.mjs";
import { validateFixture } from "../lib/input.mjs";
import { readTheme } from "../lib/theme.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAP_CLI = join(ROOT, "lib", "snap.mjs");
const OMASNAP = join(ROOT, "bin", "omasnap");
const GRUVBOX_DIR = join(ROOT, "tests", "fixtures", "themes", "gruvbox-dark", "theme");
const GRUVBOX = readTheme(GRUVBOX_DIR);

function scratchDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function canned(text) {
  return { lines: text.split("\n").map((line) => [{ text: line, color: "#ffffff", fontStyle: null, fontWeight: null }]), warnings: [] };
}

// --- detectEditor ------------------------------------------------------------

test("detectEditor maps every recorded Zed class to zed", () => {
  for (const cls of EDITOR_CLASSES.zed) assert.equal(detectEditor(cls), "zed");
});

test("detectEditor maps every recorded VS Code class to vscode", () => {
  for (const cls of EDITOR_CLASSES.vscode) assert.equal(detectEditor(cls), "vscode");
});

test("detectEditor falls back to other for foot, empty, and undefined", () => {
  assert.equal(detectEditor("foot"), "other");
  assert.equal(detectEditor(""), "other");
  assert.equal(detectEditor(undefined), "other");
});

// --- filenameFromTitle -------------------------------------------------------

test("filenameFromTitle(zed): standalone file title, filename repeated", () => {
  assert.equal(filenameFromTitle("sample.js — sample.js", "zed"), "sample.js");
});

test("filenameFromTitle(zed): a real project-open title is <project> — <file>, file last", () => {
  assert.equal(filenameFromTitle("omarchy_pacman — Board.js", "zed"), "Board.js");
});

test("filenameFromTitle(zed): a dirty-buffer marker is stripped, project-open, path kept as-is", () => {
  assert.equal(filenameFromTitle("● omarchy_pacman — src/Board.js", "zed"), "src/Board.js");
});

test("filenameFromTitle(vscode): marker, filename, folder, app name", () => {
  assert.equal(filenameFromTitle("● index.ts - omasnap - Visual Studio Code", "vscode"), "index.ts");
});

test('filenameFromTitle("other") never guesses, even for an editor-shaped title', () => {
  assert.equal(filenameFromTitle("◐ Claude Code", "other"), null);
});

test("filenameFromTitle: empty title is null", () => {
  assert.equal(filenameFromTitle("", "zed"), null);
  assert.equal(filenameFromTitle(undefined, "zed"), null);
});

test("filenameFromTitle(zed): no em dash, a dotted bare filename is used whole", () => {
  assert.equal(filenameFromTitle("main.rs", "zed"), "main.rs");
});

// --- prepareSnap --------------------------------------------------------------

test("prepareSnap: Zed class + title resolves language from the filename and reports editor zed", () => {
  const result = prepareSnap({
    text: "const a = 1;\n",
    windowClass: "dev.zed.Zed",
    title: "sample.js — sample.js",
    theme: GRUVBOX,
    highlightFn: ({ text }) => canned(text),
    fontFn: () => ({ family: "monospace", size: 13 }),
  });
  assert.equal(result.snap.editor, "zed");
  assert.equal(result.detected.language, "javascript");
  assert.equal(result.snap.language, "javascript");
  assert.equal(result.snap.filename, "sample.js");
});

test('prepareSnap: "other" class with Python shebang text detects the language from content, and the title bar falls back to it', () => {
  const result = prepareSnap({
    text: "#!/usr/bin/env python3\nprint('hi')\n",
    windowClass: "foot",
    title: "some terminal — foot",
    theme: GRUVBOX,
    highlightFn: ({ text }) => canned(text),
    fontFn: () => ({ family: "monospace", size: 13 }),
  });
  assert.equal(result.snap.editor, "other");
  assert.equal(result.detected.language, "python");
  assert.equal(result.snap.filename, "python");
});

test("prepareSnap: unknown language falls back to snippet and plain (canned) spans", () => {
  const result = prepareSnap({
    text: "just some text\n",
    windowClass: "foot",
    title: "",
    theme: GRUVBOX,
    highlightFn: ({ text }) => canned(text),
    fontFn: () => ({ family: "monospace", size: 13 }),
  });
  assert.equal(result.detected.language, null);
  assert.equal(result.snap.filename, "snippet");
  assert.deepEqual(result.snap.lines[0], [{ text: "just some text", color: "#ffffff", fontStyle: null, fontWeight: null }]);
});

test("prepareSnap: an explicit null language forces plain (no detection), unlike an omitted language", () => {
  const result = prepareSnap({
    text: "const a = 1;\n",
    windowClass: "dev.zed.Zed",
    title: "sample.js — sample.js",
    language: null,
    theme: GRUVBOX,
    highlightFn: ({ language }) => ({ lines: canned("const a = 1;").lines, warnings: [], language }),
    fontFn: () => ({ family: "monospace", size: 13 }),
  });
  assert.equal(result.snap.language, null);
  assert.equal(result.detected.language, null);
});

test("prepareSnap: an explicit language override wins over detection", () => {
  const result = prepareSnap({
    text: "const a = 1;\n",
    windowClass: "dev.zed.Zed",
    title: "sample.js — sample.js",
    language: "python",
    theme: GRUVBOX,
    highlightFn: ({ language }) => ({ lines: [[{ text: "x", color: "#000000", fontStyle: null, fontWeight: null }]], warnings: [], language }),
    fontFn: () => ({ family: "monospace", size: 13 }),
  });
  assert.equal(result.snap.language, "python");
  assert.equal(result.detected.language, "python");
});

test(`prepareSnap: a selection over ${MAX_LINES} lines truncates to exactly ${MAX_LINES} with the exact warning`, () => {
  const lines = Array.from({ length: 201 }, (_, i) => `line ${i}`);
  const result = prepareSnap({
    text: lines.join("\n"),
    windowClass: "foot",
    title: "",
    theme: GRUVBOX,
    highlightFn: ({ text }) => canned(text),
    fontFn: () => ({ family: "monospace", size: 13 }),
  });
  assert.equal(result.snap.lines.length, MAX_LINES);
  assert.ok(result.warnings.includes("snapping first 200 lines"));
});

test("prepareSnap: a NUL byte in the selection is stripped and warned about", () => {
  const result = prepareSnap({
    text: "abc\0def",
    windowClass: "foot",
    title: "",
    theme: GRUVBOX,
    highlightFn: ({ text }) => canned(text),
    fontFn: () => ({ family: "monospace", size: 13 }),
  });
  assert.ok(result.warnings.includes("selection contains binary data"));
  assert.ok(!result.snap.lines.flat().some((span) => span.text.includes("\0")));
});

test("prepareSnap: a transient window class is treated as other, with no filename guessed", () => {
  const result = prepareSnap({
    text: "x = 1\n",
    windowClass: "gcr-prompter",
    title: "sample.js — sample.js",
    theme: GRUVBOX,
    highlightFn: ({ text }) => canned(text),
    fontFn: () => ({ family: "monospace", size: 13 }),
  });
  assert.equal(result.snap.editor, "other");
  assert.equal(result.detected.filename, null);
});

// --- CLI -----------------------------------------------------------------

function writeWindow(dir, obj) {
  const path = join(dir, "window.json");
  writeFileSync(path, JSON.stringify(obj));
  return path;
}

before(() => {
  execFileSync(join(ROOT, "bin", "build-grammars"), { stdio: "inherit" });
});

test("CLI: produces an input JSON whose .snap passes validateFixture, plus languages/detected/warnings; the request JSON records pictures", () => {
  const dir = scratchDir("omasnap-snap-cli-");
  try {
    const selection = join(dir, "selection.txt");
    writeFileSync(selection, "const a = 1;\n");
    const window = writeWindow(dir, { class: "dev.zed.Zed", title: "sample.js — sample.js" });
    const request = join(dir, "request.json");
    const out = join(dir, "input.json");

    execFileSync(process.execPath, [SNAP_CLI, "--selection", selection, "--window", window, "--request", request, "--out", out, "--theme-dir", GRUVBOX_DIR], {
      encoding: "utf8",
    });

    const input = JSON.parse(readFileSync(out, "utf8"));
    assert.doesNotThrow(() => validateFixture(input.snap));
    assert.deepEqual(input.languages.slice(0, 1).length > 0, true);
    assert.equal(input.detected.editor, "zed");
    assert.equal(input.detected.language, "javascript");
    assert.ok(Array.isArray(input.warnings));

    const req = JSON.parse(readFileSync(request, "utf8"));
    assert.ok(req.pictures && typeof req.pictures === "string");
    assert.equal(req.selection, resolve(selection));
    assert.equal(req.window, resolve(window));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: a project-open Zed title (<project> — <file>) detects the language from the file half, not the project half", () => {
  const dir = scratchDir("omasnap-snap-cli-project-");
  try {
    const selection = join(dir, "selection.txt");
    writeFileSync(selection, "const a = 1;\n");
    const window = writeWindow(dir, { class: "dev.zed.Zed", title: "omarchy_pacman — src/Board.js" });
    const request = join(dir, "request.json");
    const out = join(dir, "input.json");

    execFileSync(process.execPath, [SNAP_CLI, "--selection", selection, "--window", window, "--request", request, "--out", out, "--theme-dir", GRUVBOX_DIR], {
      encoding: "utf8",
    });

    const input = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(input.detected.language, "javascript");
    assert.equal(input.detected.filename, "src/Board.js");
    assert.equal(input.snap.filename, "src/Board.js");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: an empty (whitespace-only) selection exits 3", () => {
  const dir = scratchDir("omasnap-snap-cli-empty-");
  try {
    const selection = join(dir, "selection.txt");
    writeFileSync(selection, "   \n\n");
    const window = writeWindow(dir, { class: "dev.zed.Zed", title: "sample.js — sample.js" });
    const request = join(dir, "request.json");
    const out = join(dir, "input.json");

    assert.throws(
      () => {
        execFileSync(process.execPath, [SNAP_CLI, "--selection", selection, "--window", window, "--request", request, "--out", out, "--theme-dir", GRUVBOX_DIR], {
          encoding: "utf8",
          stdio: "pipe",
        });
      },
      (err) => err.status === 3,
    );
    assert.ok(!existsSync(out));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: re-highlighting from --request with --language changes snap.language", () => {
  const dir = scratchDir("omasnap-snap-cli-rehl-");
  try {
    const selection = join(dir, "selection.txt");
    writeFileSync(selection, "const a = 1;\n");
    const window = writeWindow(dir, { class: "dev.zed.Zed", title: "sample.js — sample.js" });
    const request = join(dir, "request.json");
    const out = join(dir, "input.json");

    execFileSync(process.execPath, [SNAP_CLI, "--selection", selection, "--window", window, "--request", request, "--out", out, "--theme-dir", GRUVBOX_DIR], {
      encoding: "utf8",
    });
    const before = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(before.snap.language, "javascript");

    execFileSync(process.execPath, [SNAP_CLI, "--request", request, "--language", "python", "--out", out, "--theme-dir", GRUVBOX_DIR], { encoding: "utf8" });
    const after = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(after.snap.language, "python");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: re-highlighting with --language plain forces no language (the preview\'s "plain" entry)', () => {
  const dir = scratchDir("omasnap-snap-cli-plain-");
  try {
    const selection = join(dir, "selection.txt");
    writeFileSync(selection, "const a = 1;\n");
    const window = writeWindow(dir, { class: "dev.zed.Zed", title: "sample.js — sample.js" });
    const request = join(dir, "request.json");
    const out = join(dir, "input.json");

    execFileSync(process.execPath, [SNAP_CLI, "--selection", selection, "--window", window, "--request", request, "--out", out, "--theme-dir", GRUVBOX_DIR], {
      encoding: "utf8",
    });
    execFileSync(process.execPath, [SNAP_CLI, "--request", request, "--language", "plain", "--out", out, "--theme-dir", GRUVBOX_DIR], { encoding: "utf8" });
    const after = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(after.snap.language, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- bin/omasnap (script level, live/benchmark path) ------------------------

// A scratch HOME/XDG_RUNTIME_DIR and a PATH built only from the coreutils
// bin/omasnap actually shells out to, plus fakes for wl-paste/hyprctl/
// notify-send/qs (and a real `node`, symlinked under the plain name the
// script invokes it by) — so these tests never depend on, or affect, the
// real desktop, clipboard, or Pictures folder. Pattern matches
// tests/install.test.mjs's basePath()/addStub().
function scratchScriptEnv(prefix) {
  const home = scratchDir(prefix);
  const runtimeDir = join(home, "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  const pictures = join(home, "Pictures");
  const pathDir = join(home, "path");
  mkdirSync(pathDir, { recursive: true });
  // lib/snap.mjs's CLI always reads the *live* theme (no --theme-dir in the
  // live/benchmark path) — bin/omasnap gives it no way to point elsewhere —
  // so HOME needs a real ~/.local/state/omarchy/current/{theme.name,
  // background,theme/} for readTheme() to find, or "prepare" fails outright.
  cpSync(join(ROOT, "tests", "fixtures", "themes", "gruvbox-dark"), join(home, ".local", "state", "omarchy", "current"), { recursive: true });
  for (const tool of ["bash", "readlink", "dirname", "mkdir", "rm", "date", "cat"]) {
    const real = join("/usr/bin", tool);
    if (existsSync(real)) symlinkSync(real, join(pathDir, tool));
  }
  symlinkSync(process.execPath, join(pathDir, "node"));
  return { home, runtimeDir, pictures, pathDir };
}

function writeFakeTool(pathDir, name, body) {
  writeFileSync(join(pathDir, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
}

// A `qs` that records that it ran (and its args) instead of ever actually
// starting Quickshell — every script-level test below asserts this file was
// never created, i.e. bin/omasnap never got as far as launching a window.
function writeQsSpy(pathDir, home) {
  writeFakeTool(pathDir, "qs", `echo "$@" >> "${join(home, "qs-invocations.txt")}"\nexit 0`);
}

function runOmasnap(args, { pathDir, home, runtimeDir }) {
  return spawnSync(OMASNAP, args, {
    encoding: "utf8",
    cwd: home,
    env: { HOME: home, XDG_RUNTIME_DIR: runtimeDir, PATH: pathDir },
  });
}

test("bin/omasnap --benchmark: times a 60-line selection, prints the four timing lines, leaves no runtime files or Pictures writes, and never launches qs", () => {
  const { home, runtimeDir, pictures, pathDir } = scratchScriptEnv("omasnap-bin-benchmark-");
  try {
    const lines = ["function fib(n) {"];
    for (let i = 0; i < 58; i++) lines.push(`  const x${i} = ${i} * 2 + 1;`);
    lines.push("  return n;", "}");
    const selectionPath = join(home, "selection-src.txt");
    writeFileSync(selectionPath, lines.join("\n") + "\n");

    writeFakeTool(pathDir, "wl-paste", `cat "${selectionPath}"`);
    writeFakeTool(pathDir, "hyprctl", 'if [ "$1" = "activewindow" ]; then echo \'{"class":"dev.zed.Zed","title":"sample.js — sample.js"}\'; exit 0; fi\nexit 1');
    writeFakeTool(pathDir, "notify-send", "exit 0");
    writeFakeTool(pathDir, "xdg-user-dir", `echo "${pictures}"`);
    writeQsSpy(pathDir, home);

    const result = runOmasnap(["--benchmark"], { pathDir, home, runtimeDir });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^selection: \d+ ms$/m);
    assert.match(result.stdout, /^window: \d+ ms$/m);
    assert.match(result.stdout, /^prepare: \d+ ms$/m);
    assert.match(result.stdout, /^total: \d+ ms$/m);

    const runtimeContents = existsSync(join(runtimeDir, "omasnap")) ? readdirSync(join(runtimeDir, "omasnap")) : [];
    assert.deepEqual(runtimeContents, [], "no files left in the runtime dir");
    assert.ok(!existsSync(pictures), "nothing written under Pictures");
    assert.ok(!existsSync(join(home, "qs-invocations.txt")), "qs must never be launched by --benchmark");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("bin/omasnap: an empty selection notifies \"Nothing selected\" and exits 0 without ever launching qs", () => {
  const { home, runtimeDir, pictures, pathDir } = scratchScriptEnv("omasnap-bin-empty-");
  try {
    writeFakeTool(pathDir, "wl-paste", "exit 1"); // both --primary and the clipboard fallback come up empty
    writeFakeTool(pathDir, "hyprctl", "exit 1");
    writeFakeTool(pathDir, "xdg-user-dir", `echo "${pictures}"`);
    writeFakeTool(pathDir, "notify-send", `printf '%s\\n' "$@" >> "${join(home, "notify-calls.txt")}"`);
    writeQsSpy(pathDir, home);

    const result = runOmasnap([], { pathDir, home, runtimeDir });

    assert.equal(result.status, 0, result.stderr);
    const notifyCalls = readFileSync(join(home, "notify-calls.txt"), "utf8");
    assert.match(notifyCalls, /^Omasnap$/m);
    assert.match(notifyCalls, /^Nothing selected$/m);
    assert.ok(!existsSync(join(home, "qs-invocations.txt")), "qs must never be launched for an empty selection");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
