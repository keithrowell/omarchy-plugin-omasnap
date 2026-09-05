import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { validateFixture, resolveSpans, buildInput, CONSTANTS } from "../lib/input.mjs";
import { readTheme } from "../lib/theme.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RENDER_FIXTURES = join(ROOT, "tests", "fixtures", "render");
const HELLO_PATH = join(RENDER_FIXTURES, "hello.json");
const LONG_PATH = join(RENDER_FIXTURES, "long.json");
const HELLO = JSON.parse(readFileSync(HELLO_PATH, "utf8"));
const LONG = JSON.parse(readFileSync(LONG_PATH, "utf8"));

const GRUVBOX_DIR = join(ROOT, "tests", "fixtures", "themes", "gruvbox-dark", "theme");
const FLEXOKI_DIR = join(ROOT, "tests", "fixtures", "themes", "flexoki-light", "theme");
const GRUVBOX = readTheme(GRUVBOX_DIR);
const FLEXOKI = readTheme(FLEXOKI_DIR);

function scratchDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// --- validateFixture -------------------------------------------------------

test("validateFixture accepts both committed render fixtures", () => {
  assert.doesNotThrow(() => validateFixture(HELLO));
  assert.doesNotThrow(() => validateFixture(LONG));
});

test("validateFixture throws naming the path of a span missing text", () => {
  const broken = structuredClone(HELLO);
  delete broken.lines[3][1].text;
  assert.throws(() => validateFixture(broken), /lines\[3\]\[1\]\.text/);
});

test("validateFixture throws naming the path of a line that is not an array", () => {
  const broken = structuredClone(HELLO);
  broken.lines[2] = { text: "not a line" };
  assert.throws(() => validateFixture(broken), /lines\[2\]/);
});

// --- resolveSpans ------------------------------------------------------------

function flat(lines) {
  return lines.flat();
}

test("resolveSpans(gruvbox): keyword gets zed's syntax colour and font weight", () => {
  const resolved = resolveSpans([[{ text: "function", capture: "keyword" }]], GRUVBOX);
  const expected = GRUVBOX.zed.syntax.keyword;
  assert.equal(resolved[0][0].color, expected.color);
  assert.equal(resolved[0][0].fontWeight, expected.fontWeight ?? null);
});

test("resolveSpans(gruvbox): an unknown dotted capture falls back to its parent (punctuation.delimiter)", () => {
  const resolved = resolveSpans([[{ text: ";", capture: "punctuation.delimiter.x" }]], GRUVBOX);
  const expected = GRUVBOX.zed.syntax["punctuation.delimiter"];
  assert.equal(resolved[0][0].color, expected.color);
});

test("resolveSpans(gruvbox): a capture with no match at all gets the editor foreground", () => {
  const resolved = resolveSpans([[{ text: "x", capture: "totally.unknown.capture" }]], GRUVBOX);
  assert.equal(resolved[0][0].color, GRUVBOX.zed.style.editorForeground);
});

test("resolveSpans: an explicit color passes through unchanged, ignoring any capture", () => {
  const resolved = resolveSpans([[{ text: "x", capture: "keyword", color: "#123456", fontStyle: "italic" }]], GRUVBOX);
  assert.deepEqual(resolved[0][0], { text: "x", color: "#123456", fontStyle: "italic", fontWeight: null });
});

test("resolveSpans: a tab expands to the next multiple of 4 columns", () => {
  const resolved = resolveSpans([[{ text: "ab\tc" }]], GRUVBOX);
  assert.equal(resolved[0][0].text, "ab  c"); // column 2 -> pad 2 to reach column 4
  const resolved2 = resolveSpans([[{ text: "a" }, { text: "\t" }]], GRUVBOX);
  assert.equal(resolved2[0].map((s) => s.text).join(""), "a   "); // column 1 -> pad 3
});

test("resolveSpans(gruvbox): every fixture line's spans concatenate to the original text (tabs expanded)", () => {
  for (const fixture of [HELLO, LONG]) {
    const resolved = resolveSpans(fixture.lines, GRUVBOX);
    resolved.forEach((line, i) => {
      const original = fixture.lines[i].map((s) => s.text).join("");
      assert.equal(line.map((s) => s.text).join(""), original, `line ${i}`);
    });
  }
});

test("resolveSpans(flexoki): colours differ from gruvbox for the same captures", () => {
  const spans = [
    { text: "function", capture: "keyword" },
    { text: "// hi", capture: "comment" },
    { text: "x", capture: "string" },
  ];
  const g = resolveSpans([spans], GRUVBOX)[0];
  const f = resolveSpans([spans], FLEXOKI)[0];
  g.forEach((span, i) => {
    assert.notEqual(span.color, f[i].color, spans[i].capture);
  });
});

// --- buildInput --------------------------------------------------------------

test("buildInput: a missing wallpaper file resolves to null", () => {
  const input = buildInput({ snap: HELLO, theme: GRUVBOX, wallpaperOverride: "/no/such/file.webp" });
  assert.equal(input.theme.wallpaper, null);
});

test("buildInput: the fixture theme's own wallpaper resolves to its real omarchy.webp path", () => {
  const input = buildInput({ snap: HELLO, theme: GRUVBOX });
  assert.ok(input.theme.wallpaper, "expected a wallpaper path");
  assert.ok(input.theme.wallpaper.endsWith("omarchy.webp"));
});

test("buildInput: a relative --wallpaper resolves to an absolute path (Snap.qml needs one for its file:// URL)", () => {
  const relativeWallpaper = relative(process.cwd(), GRUVBOX.wallpaper);
  assert.ok(!isAbsolute(relativeWallpaper), "test setup: expected a relative path to exercise");
  const input = buildInput({ snap: HELLO, theme: GRUVBOX, wallpaperOverride: relativeWallpaper });
  assert.equal(input.theme.wallpaper, resolve(relativeWallpaper));
  assert.ok(isAbsolute(input.theme.wallpaper));
});

test("buildInput: theme.editor.* is populated from Zed when a zed theme is loaded", () => {
  const input = buildInput({ snap: HELLO, theme: GRUVBOX });
  assert.equal(input.theme.editor.background, GRUVBOX.zed.style.editorBackground);
  assert.equal(input.theme.editor.foreground, GRUVBOX.zed.style.editorForeground);
  assert.equal(input.theme.editor.lineNumber, GRUVBOX.zed.style.lineNumber);
});

test("buildInput: falls back to colors.toml when the theme has no Zed file", () => {
  const dir = scratchDir("omasnap-input-novscode-");
  try {
    writeFileSync(
      join(dir, "colors.toml"),
      [
        'mode = "dark"',
        'accent = "#7daea3"',
        'selection = "#504945"',
        'muted = "#665c54"',
        'background = "#161616"',
        'dark_background = "#0e0e0e"',
        'darker_background = "#080808"',
        'lighter_background = "#282828"',
        'foreground = "#d4be98"',
        'dark_foreground = "#7c6f64"',
        'light_foreground = "#bdae93"',
        'bright_foreground = "#d4be98"',
      ].join("\n"),
    );
    const theme = readTheme(dir);
    assert.equal(theme.zed, null);
    const input = buildInput({ snap: HELLO, theme });
    assert.equal(input.theme.editor.background, theme.colors.background);
    assert.equal(input.theme.editor.foreground, theme.colors.foreground);
    const resolved = resolveSpans([[{ text: "function", capture: "keyword" }]], theme);
    assert.equal(resolved[0][0].color, theme.colors.foreground);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- CLI -----------------------------------------------------------------

test("CLI: prints valid JSON whose snap.lines.length matches the fixture", () => {
  const out = execFileSync(
    process.execPath,
    [join(ROOT, "lib", "input.mjs"), "--fixture", HELLO_PATH, "--theme-dir", GRUVBOX_DIR],
    { encoding: "utf8" },
  );
  const input = JSON.parse(out);
  assert.equal(input.snap.lines.length, HELLO.lines.length);
});

test("CLI: exits 2 when --fixture is missing", () => {
  assert.throws(() => {
    execFileSync(process.execPath, [join(ROOT, "lib", "input.mjs")], { encoding: "utf8", stdio: "pipe" });
  }, (err) => err.status === 2);
});

// --- Constants agreement between lib/input.mjs and app/Snap.qml -----------

test("app/Snap.qml declares the same minWidth/maxWidth/minLines constants as lib/input.mjs", () => {
  const qml = readFileSync(join(ROOT, "app", "Snap.qml"), "utf8");
  const minWidth = /readonly property int\s+minWidth:\s*(\d+)/.exec(qml);
  const maxWidth = /readonly property int\s+maxWidth:\s*(\d+)/.exec(qml);
  const minLines = /readonly property int\s+minLines:\s*(\d+)/.exec(qml);
  assert.ok(minWidth, "Snap.qml must declare minWidth");
  assert.ok(maxWidth, "Snap.qml must declare maxWidth");
  assert.ok(minLines, "Snap.qml must declare minLines");
  assert.equal(Number(minWidth[1]), CONSTANTS.minWidth);
  assert.equal(Number(maxWidth[1]), CONSTANTS.maxWidth);
  assert.equal(Number(minLines[1]), CONSTANTS.minLines);
});
