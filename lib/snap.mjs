// Live-selection glue: turns a raw selection plus the active window's class
// and title into the frame renderer's input. This is spec 0006's new
// module; everything it calls (`detectLanguage`, `highlight`,
// `readEditorFont`, `buildInput`) shipped in earlier specs.
//
// Pure ES module (the `prepareSnap`/`detectEditor`/`filenameFromTitle`
// exports): no Qt, no caching, no subprocess of its own — `highlightFn` and
// `fontFn` default to the real `highlight()` and the real
// `readEditorFont()`/`resolveFontFamily()` pair, both already pure or
// hermetic-by-injection themselves. The CLI entry point below is the only
// part of this file that touches the filesystem or a subprocess directly
// (reading the selection/window/request files and `xdg-user-dir`).
//
// Recorded title samples (spike 0002's findings.md, Q3, plus a live
// `hyprctl activewindow -j` read taken during this build against a real
// project-open Zed window; also see the module's own filenameFromTitle
// comment): a standalone Zed file (no project open) is `<file> — <file>`
// (em dash, U+2014, both halves the same). A real project-open window's
// title is `<project> — <file>` — **project first, file last** (the
// spike's own guess of `<file> — <project>` was wrong; corrected here from
// `omarchy_pacman — Board.js` and, dirty, `● omarchy_pacman — src/Board.js`
// — Zed keeps the file's path relative to the project root after the
// dash). VS Code's convention (not from the spike — VS Code was not
// installed to test with; following its well-known title format) is
// `<file> - <folder> - Visual Studio Code` (hyphen, **file first**) —
// unaffected by the Zed correction above.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readTheme, DEFAULT_THEME_DIR } from "./theme.mjs";
import { detectLanguage, LANGUAGES } from "./language.mjs";
import { highlight, REPO_ROOT } from "./highlight/zed.mjs";
import { readEditorFont, resolveFontFamily } from "./editors.mjs";
import { buildInput } from "./input.mjs";

export const MAX_LINES = 200;

/** Window classes each editor is known to launch under (spike 0002, Q3, for Zed; VS Code's forks/variants by convention). */
export const EDITOR_CLASSES = {
  zed: ["dev.zed.Zed", "dev.zed.Zed-Dev", "dev.zed.Zed-Preview"],
  vscode: ["code", "Code", "code-url-handler", "code-oss", "Code - OSS", "codium", "VSCodium", "cursor", "Cursor"],
};

/**
 * Window classes known to appear as a transient "active window" right after
 * an exec-style dispatch fires, per the spike's Q2 (a keyring prompt, a
 * quickshell overlay) plus Omasnap's and Omarchy's own shell/lock surfaces.
 * Never an editor; used only to skip title parsing defensively (see
 * `prepareSnap` below) — `detectEditor` already resolves any of these to
 * `"other"` on its own, since none of them is in `EDITOR_CLASSES`.
 */
const TRANSIENT_CLASSES = ["gcr-prompter", "quickshell", "omarchy-shell", "hyprlock"];

/** A leading "unsaved buffer" marker some editors prefix a dirty file's title with. */
const DIRTY_MARKER_RE = /^[●•*◌]\s+/;

/** `"zed" | "vscode" | "other"`, from a Hyprland `class`/`initialClass` string. */
export function detectEditor(windowClass) {
  if (EDITOR_CLASSES.zed.includes(windowClass)) return "zed";
  if (EDITOR_CLASSES.vscode.includes(windowClass)) return "vscode";
  return "other";
}

/**
 * Extract a filename from a window title, per editor:
 * - Zed: `<project> — <file>` (em dash) -> the segment **after the last**
 *   em dash (a standalone file with no project open repeats the filename
 *   on both sides, so this still gives the right answer: `sample.js —
 *   sample.js` -> `sample.js`). The result may be a project-relative path
 *   (e.g. `src/Board.js`) rather than a bare filename — `detectLanguage`
 *   basenames it before matching a suffix, so that's fine as-is. If there
 *   is no em dash at all but the (marker-stripped) title looks like a bare
 *   filename (contains a dot, no spaces), the whole title.
 * - VS Code: `<file> - <folder> - Visual Studio Code` (hyphen, file
 *   *first*, unlike Zed) -> the first `" - "`-delimited segment.
 * - anything else: `null` (never guessed).
 *
 * A leading dirty-buffer marker (`● `, `• `, `* `, `◌ `) is stripped first.
 * Returns `null` when there is nothing to extract, or the extracted
 * candidate is empty or made up only of path separators.
 */
export function filenameFromTitle(title, editor) {
  if (typeof title !== "string" || title === "") return null;
  const stripped = title.replace(DIRTY_MARKER_RE, "").trim();
  if (stripped === "") return null;

  let candidate = null;
  if (editor === "zed") {
    const dashIndex = stripped.lastIndexOf("—");
    if (dashIndex !== -1) {
      candidate = stripped.slice(dashIndex + 1).trim();
    } else if (stripped.includes(".") && !/\s/.test(stripped)) {
      candidate = stripped;
    }
  } else if (editor === "vscode") {
    const match = /^(.+?)\s*-\s*/.exec(stripped);
    if (match) candidate = match[1].trim();
  }

  if (!candidate) return null;
  if (/^\/+$/.test(candidate)) return null;
  return candidate;
}

/**
 * Build the frame renderer's input (`{ snap, warnings, detected }`) from a
 * raw selection and the active window's `class`/`title`.
 *
 * - `text` is hygienically cleaned first: a NUL byte (a binary-looking
 *   selection) is stripped and warned about, then the selection is
 *   truncated to `MAX_LINES` lines with a warning if it was longer.
 * - `editor` comes from `detectEditor(windowClass)`. A transient/unknown
 *   window (see `TRANSIENT_CLASSES`) never attempts title parsing at all —
 *   though `filenameFromTitle` already returns `null` for `"other"`
 *   regardless, this skips the call rather than relying on that.
 * - `language`: an explicit `undefined` (the default — simply not passing
 *   the option) means "detect it", via `detectLanguage({ filename, text })`;
 *   any other value, including `null`, is used as-is. `null` is the
 *   preview's language selector's "plain" entry — force no highlighting at
 *   all, distinct from "not specified, please detect."
 * - `lines` come from `highlightFn` (defaults to the real Zed highlighter,
 *   `highlight()`), which already resolves every span to an explicit
 *   `color` — nothing downstream needs `theme.zed` again.
 * - `font` comes from `fontFn` (defaults to `readEditorFont` for the
 *   detected editor — `"other"` reads Zed's own font/settings, since the
 *   Zed pipeline is what still highlights it — piped through
 *   `resolveFontFamily` so an uninstalled font family substitutes to the
 *   system monospace rather than Qt's own, usually proportional, fallback).
 * - `snap.filename` (what the title bar shows) is the extracted filename,
 *   else the language id, else `"snippet"` — `detected.filename` keeps the
 *   raw extracted value (possibly `null`) instead, for callers that care
 *   what was actually found versus what is merely displayed.
 */
export function prepareSnap({ text, windowClass, title, language, theme, root = REPO_ROOT, highlightFn = highlight, fontFn } = {}) {
  const warnings = [];

  let cleanText = typeof text === "string" ? text : "";
  if (cleanText.includes("\0")) {
    warnings.push("selection contains binary data");
    cleanText = cleanText.replace(/\0/g, "");
  }

  const allLines = cleanText.split("\n");
  if (allLines.length > MAX_LINES) {
    cleanText = allLines.slice(0, MAX_LINES).join("\n");
    warnings.push("snapping first 200 lines");
  }

  const editor = detectEditor(windowClass);
  const extractedFilename =
    editor === "other" && (!title || TRANSIENT_CLASSES.includes(windowClass)) ? null : filenameFromTitle(title, editor);

  const resolvedLanguage = language !== undefined ? language : detectLanguage({ filename: extractedFilename, text: cleanText });

  const highlighted = highlightFn({ text: cleanText, language: resolvedLanguage, theme, root });
  warnings.push(...(highlighted.warnings ?? []));

  const font = fontFn
    ? fontFn(editor)
    : (() => {
        const raw = readEditorFont(editor === "other" ? "zed" : editor);
        const resolved = resolveFontFamily(raw.family);
        return { family: resolved.family, size: raw.size };
      })();

  const displayFilename = extractedFilename ?? resolvedLanguage ?? "snippet";

  return {
    snap: {
      filename: displayFilename,
      language: resolvedLanguage,
      editor,
      font,
      lines: highlighted.lines,
    },
    warnings,
    detected: { editor, language: resolvedLanguage, filename: extractedFilename },
  };
}

// --- CLI ---------------------------------------------------------------

function parseArgs(argv) {
  const args = { selection: null, window: null, request: null, out: null, language: undefined, themeDir: DEFAULT_THEME_DIR };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--selection") args.selection = argv[++i];
    else if (arg === "--window") args.window = argv[++i];
    else if (arg === "--request") args.request = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--language") args.language = argv[++i];
    else if (arg === "--theme-dir") args.themeDir = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

/**
 * `--language`'s CLI value to `prepareSnap`'s `language` parameter: absent
 * (`undefined`) means "detect it"; the literal `"plain"` (the preview's
 * language selector's no-highlighting entry) means "force no language, no
 * highlighting" (`null`); anything else is used as the override id as-is.
 */
function resolveLanguageArg(raw) {
  if (raw === undefined) return undefined;
  if (raw === "plain") return null;
  return raw;
}

/** `xdg-user-dir PICTURES`, falling back to `~/Pictures` if the tool is missing or fails. Never throws. */
function picturesDir() {
  try {
    const out = execFileSync("xdg-user-dir", ["PICTURES"], { encoding: "utf8" }).trim();
    if (out) return out;
  } catch {
    // fall through to the default below
  }
  return join(homedir(), "Pictures");
}

/** Read a window-info JSON file (as `hyprctl activewindow -j` writes, or `{}`); never throws. */
function readWindowInfo(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeInput({ outPath, snap, warnings, detected, theme }) {
  const input = buildInput({ snap, theme });
  input.warnings = warnings;
  input.languages = Object.keys(LANGUAGES);
  input.detected = detected;
  writeFileSync(outPath, JSON.stringify(input));
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`snap: ${err.message}`);
    process.exit(2);
  }

  if (!args.out) {
    console.error("snap: --out is required");
    process.exit(2);
  }

  // Re-highlight mode: a `--request` with no `--selection`/`--window` means
  // "re-read what an earlier CLI run recorded and rebuild with a language
  // override" (the preview's language selector).
  if (args.request && !args.selection && !args.window) {
    if (!args.language) {
      console.error("snap: --language is required when re-highlighting from --request");
      process.exit(2);
    }
    let request;
    try {
      request = JSON.parse(readFileSync(args.request, "utf8"));
      const text = readFileSync(request.selection, "utf8");
      const windowInfo = readWindowInfo(request.window);
      const theme = readTheme(args.themeDir);
      const result = prepareSnap({
        text,
        windowClass: windowInfo.class,
        title: windowInfo.title,
        language: resolveLanguageArg(args.language),
        theme,
        root: request.root ?? REPO_ROOT,
      });
      writeInput({ outPath: args.out, snap: result.snap, warnings: result.warnings, detected: result.detected, theme });
    } catch (err) {
      console.error(`snap: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  if (!args.selection || !args.window || !args.request) {
    console.error("snap: --selection, --window and --request are required (or --request alone with --language, to re-highlight)");
    process.exit(2);
  }

  let text;
  try {
    text = readFileSync(args.selection, "utf8");
  } catch (err) {
    console.error(`snap: ${err.message}`);
    process.exit(1);
  }

  if (text.trim() === "") {
    process.exit(3);
  }

  try {
    const windowInfo = readWindowInfo(args.window);
    const theme = readTheme(args.themeDir);
    const result = prepareSnap({
      text,
      windowClass: windowInfo.class,
      title: windowInfo.title,
      language: resolveLanguageArg(args.language),
      theme,
      root: REPO_ROOT,
    });

    writeInput({ outPath: args.out, snap: result.snap, warnings: result.warnings, detected: result.detected, theme });

    const request = {
      selection: resolve(args.selection),
      window: resolve(args.window),
      root: REPO_ROOT,
      pictures: picturesDir(),
      language: result.detected.language,
    };
    writeFileSync(args.request, JSON.stringify(request));
  } catch (err) {
    console.error(`snap: ${err.message}`);
    process.exit(1);
  }
}

// CLI entry point: `node lib/snap.mjs --selection F --window F --request F --out F [--language X]`
// or `node lib/snap.mjs --request F --language X --out F` (re-highlight).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
