// Editor font reader: the buffer/editor font Zed or VS Code is configured
// with, falling back to the system monospace font.
//
// Pure ES module: no Qt, no caching. `readEditorFont` re-reads the settings
// file on every call.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Strip `//` line comments, `/* *\/` block comments, and trailing commas
 * before `}` or `]` from a JSONC document, so it can be handed to
 * `JSON.parse`. String-aware: a `//` or `/*` inside a double-quoted string
 * (e.g. a URL) is left alone, and an escaped quote (`\"`) does not end the
 * string early.
 */
export function stripJsonc(text) {
  let out = "";
  let inString = false;
  const n = text.length;
  let i = 0;

  while (i < n) {
    const ch = text[i];

    if (inString) {
      if (ch === "\\" && i + 1 < n) {
        out += ch + text[i + 1];
        i += 2;
        continue;
      }
      out += ch;
      if (ch === '"') inString = false;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i++;
      continue;
    }

    if (ch === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }

    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  return out.replace(/,(\s*[}\]])/g, "$1");
}

function firstFamily(value) {
  const first = value.split(",")[0].trim();
  return first.replace(/^['"]|['"]$/g, "");
}

function defaultFcMatch() {
  const raw = execFileSync("fc-match", ["--format", "%{family}", "monospace"], { encoding: "utf8" });
  return raw.split(",")[0].trim();
}

function systemFont(fcMatch) {
  const runner = typeof fcMatch === "function" ? fcMatch : defaultFcMatch;
  let family = "monospace";
  try {
    const result = runner();
    if (typeof result === "string" && result.trim() !== "") family = result.trim();
  } catch {
    family = "monospace";
  }
  return { family, size: 13, source: "system" };
}

/** Read `key`/`sizeKey` out of a JSONC settings file, with a regex fallback if it won't parse. */
function readFont(path, key, sizeKey, extractFamily) {
  const text = readFileSync(path, "utf8");
  let family;
  let size;

  try {
    const data = JSON.parse(stripJsonc(text));
    if (typeof data[key] === "string") family = extractFamily(data[key]);
    if (typeof data[sizeKey] === "number") size = data[sizeKey];
  } catch {
    const familyMatch = new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*"([^"]*)"`).exec(text);
    const sizeMatch = new RegExp(`"${sizeKey.replace(/\./g, "\\.")}"\\s*:\\s*([0-9.]+)`).exec(text);
    if (familyMatch) family = extractFamily(familyMatch[1]);
    if (sizeMatch) size = Number(sizeMatch[1]);
  }

  return { family, size };
}

/**
 * The configured buffer/editor font for `editor` (`"zed"` or `"vscode"`),
 * falling back to the system monospace font (`fc-match monospace`) at size
 * 13 for anything else, a missing settings file, or a missing key. Never
 * throws.
 *
 * `home` and `fcMatch` are injectable for hermetic tests; `fcMatch`
 * defaults to running `fc-match` with no shell.
 */
export function readEditorFont(editor, { home = homedir(), fcMatch } = {}) {
  let path;
  let key;
  let sizeKey;
  let extractFamily;
  let source;

  if (editor === "zed") {
    path = join(home, ".config/zed/settings.json");
    key = "buffer_font_family";
    sizeKey = "buffer_font_size";
    extractFamily = (value) => value;
    source = "zed";
  } else if (editor === "vscode") {
    path = join(home, ".config/Code/User/settings.json");
    key = "editor.fontFamily";
    sizeKey = "editor.fontSize";
    extractFamily = firstFamily;
    source = "vscode";
  } else {
    return systemFont(fcMatch);
  }

  if (!existsSync(path)) return systemFont(fcMatch);

  const { family, size } = readFont(path, key, sizeKey, extractFamily);
  if (family === undefined && size === undefined) return systemFont(fcMatch);

  const sys = systemFont(fcMatch);
  return {
    family: family ?? sys.family,
    size: size ?? sys.size,
    source,
  };
}

/** `fc-match -f '%{family}' "<family>"`, first comma-separated family, trimmed. */
function defaultFcMatchFamily(family) {
  const raw = execFileSync("fc-match", ["-f", "%{family}", family], { encoding: "utf8" });
  return raw.split(",")[0].trim();
}

/**
 * Is `family` actually installed? Runs `fc-match -f '%{family}' "<family>"`
 * (fixed argv, no shell) and compares its first returned family to the one
 * asked for, case-insensitively — fontconfig silently substitutes an
 * installed font (e.g. Liberation Sans) when the requested one is missing,
 * so a plain "did this return something" check would always pass. Returns
 * `{ family, substituted }`: `family` unchanged when installed, else the
 * system monospace family (a second `fcMatch("monospace")` call, the same
 * way `readEditorFont`'s own fallback works) with `substituted: true`.
 * `fcMatch` is injectable (single-argument: the family being queried) for
 * hermetic tests; it defaults to running the real `fc-match` twice, once
 * per query above. Never throws.
 */
export function resolveFontFamily(family, { fcMatch } = {}) {
  const runner = typeof fcMatch === "function" ? fcMatch : defaultFcMatchFamily;

  let matched = null;
  try {
    matched = runner(family);
  } catch {
    matched = null;
  }

  if (typeof matched === "string" && matched.trim().toLowerCase() === String(family).trim().toLowerCase()) {
    return { family, substituted: false };
  }

  let monospace = "monospace";
  try {
    const result = runner("monospace");
    if (typeof result === "string" && result.trim() !== "") monospace = result.split(",")[0].trim();
  } catch {
    monospace = "monospace";
  }
  return { family: monospace, substituted: true };
}
