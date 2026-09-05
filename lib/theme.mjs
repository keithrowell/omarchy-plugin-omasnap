// Theme reader for the current Omarchy theme.
//
// Pure ES module: no Qt, no caching, no network. Every call to readTheme()
// re-reads the theme directory from disk so a live theme switch is always
// picked up on the next snap. There are no fallback colours here — unlike
// the Pacman plugin's lib/theme.mjs, a malformed colors.toml throws rather
// than being silently ignored, because Omasnap has nowhere safe to fall
// back to (every colour must come from the theme).

import { readFileSync, existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, basename } from "node:path";

export const DEFAULT_THEME_DIR = join(homedir(), ".local/state/omarchy/current/theme");

const KEY_VALUE = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/;

/** Strip a trailing `# comment` that is outside quotes. */
function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#") {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Remove one layer of matching quotes from a value, if present. */
function unquote(value) {
  const first = value[0];
  const last = value[value.length - 1];
  if (value.length >= 2 && first === last && (first === '"' || first === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse the flat `key = "value"` subset of TOML that colors.toml uses.
 * Comments and blank lines are skipped; every other non-blank line must be
 * `key = value` (quoted or bare) or parseColors throws, naming the offending
 * line. Returns a plain object of strings — no validation of hex here, the
 * theme is trusted.
 */
export function parseColors(text) {
  const result = {};
  if (typeof text !== "string" || text.length === 0) return result;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = stripComment(raw).trim();
    if (stripped === "") continue;
    const match = KEY_VALUE.exec(stripped);
    if (!match) {
      throw new Error(`colors.toml line ${i + 1}: ${raw.trim()}`);
    }
    result[match[1]] = unquote(match[2].trim());
  }
  return result;
}

/** Rename Zed's `style` dotted keys onto the stable camelCase names the renderer uses. */
function flattenZedStyle(style) {
  const players = Array.isArray(style.players) ? style.players : [];
  const selectionBackground = players[0]?.selection ?? style["element.selected"] ?? null;
  return {
    editorBackground: style["editor.background"] ?? null,
    editorForeground: style["editor.foreground"] ?? null,
    gutterBackground: style["editor.gutter.background"] ?? null,
    lineNumber: style["editor.line_number"] ?? null,
    lineNumberActive: style["editor.active_line_number"] ?? null,
    activeLineBackground: style["editor.active_line.background"] ?? null,
    selectionBackground,
    background: style["background"] ?? null,
    border: style["border"] ?? null,
    text: style["text"] ?? null,
    textMuted: style["text.muted"] ?? null,
    accent: style["text.accent"] ?? null,
    titleBarBackground: style["title_bar.background"] ?? null,
    tabBarBackground: style["tab_bar.background"] ?? null,
    terminalBackground: style["terminal.background"] ?? null,
  };
}

/** Rename Zed's `font_style` / `font_weight` syntax entries to camelCase, preserving null. */
function flattenZedSyntax(syntax) {
  const result = {};
  for (const [capture, entry] of Object.entries(syntax || {})) {
    result[capture] = {
      color: entry.color ?? null,
      fontStyle: entry.font_style ?? null,
      fontWeight: entry.font_weight ?? null,
    };
  }
  return result;
}

/**
 * Read and normalise zed-theme.json. Picks the theme entry whose appearance
 * matches `mode`, else the first entry. Returns null if the file is absent.
 */
function readZedTheme(path, mode) {
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf8"));
  const themes = Array.isArray(data.themes) ? data.themes : [];
  const picked = themes.find((t) => t.appearance === mode) ?? themes[0];
  if (!picked) return null;
  const style = picked.style ?? {};
  return {
    name: picked.name ?? null,
    appearance: picked.appearance ?? null,
    style: flattenZedStyle(style),
    syntax: flattenZedSyntax(style.syntax),
    raw: style,
  };
}

/** Split a tokenColors `scope` (string or array, comma-separated) into trimmed selectors. */
function normalizeScope(scope) {
  if (Array.isArray(scope)) {
    return scope.flatMap((s) => (typeof s === "string" ? s.split(",").map((p) => p.trim()) : [])).filter(Boolean);
  }
  if (typeof scope === "string") {
    return scope.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Read and normalise vscode-theme.json. Returns null if the file is absent.
 */
function readVscodeTheme(path) {
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf8"));
  const tokenColors = Array.isArray(data.tokenColors)
    ? data.tokenColors.map((rule) => ({ ...rule, scope: normalizeScope(rule.scope) }))
    : [];
  return {
    name: data.name ?? null,
    type: data.type ?? null,
    colors: data.colors ?? {},
    tokenColors,
    semanticTokenColors: data.semanticTokenColors ?? {},
    descriptor: null,
  };
}

/**
 * Read the current Omarchy theme directory into one plain object:
 * `{ name, mode, colors, zed, vscode, wallpaper, dir }`. Nothing is cached —
 * every call re-reads every file, so a theme switch between snaps is always
 * picked up.
 *
 * `colors.toml` is the one file that must exist; a missing or malformed
 * file throws. `zed-theme.json` / `vscode-theme.json` are optional — their
 * corresponding key is `null` when absent, and only the helpers that need
 * them (`zedSyntaxStyle`, `vscodeScopeStyle`) throw for that.
 */
export function readTheme(dir = DEFAULT_THEME_DIR) {
  const colors = parseColors(readFileSync(join(dir, "colors.toml"), "utf8"));
  const mode = colors.mode === "light" || colors.mode === "dark" ? colors.mode : "dark";

  const parent = dirname(dir);

  const namePath = join(parent, "theme.name");
  const name = existsSync(namePath) ? readFileSync(namePath, "utf8").trim() : basename(realpathSync(dir));

  const backgroundPath = join(parent, "background");
  const wallpaper = existsSync(backgroundPath) ? realpathSync(backgroundPath) : null;

  const zed = readZedTheme(join(dir, "zed-theme.json"), mode);

  const vscode = readVscodeTheme(join(dir, "vscode-theme.json"));
  if (vscode) {
    const descriptorPath = join(dir, "vscode.json");
    vscode.descriptor = existsSync(descriptorPath) ? JSON.parse(readFileSync(descriptorPath, "utf8")) : null;
  }

  return { name, mode, colors, zed, vscode, wallpaper, dir };
}

/**
 * Resolve a Zed syntax capture (e.g. `"punctuation.bracket.special"`) to a
 * style, applying Zed's own fallback: try the capture, then repeatedly drop
 * its last dotted segment (`a.b.c` -> `a.b` -> `a`) until an entry is found.
 * No match at all falls back to the editor foreground. Throws if `zed` is
 * null (readTheme found no zed-theme.json).
 */
export function zedSyntaxStyle(zed, capture) {
  if (!zed) throw new Error("no Zed theme loaded");
  const editorForeground = zed.style.editorForeground;

  let key = capture;
  while (key) {
    const entry = zed.syntax[key];
    if (entry) {
      return {
        color: entry.color ?? editorForeground,
        fontStyle: entry.fontStyle ?? null,
        fontWeight: entry.fontWeight ?? null,
      };
    }
    const dot = key.lastIndexOf(".");
    if (dot === -1) break;
    key = key.slice(0, dot);
  }
  return { color: editorForeground, fontStyle: null, fontWeight: null };
}

/** Parse a VS Code `fontStyle` string (e.g. `"italic bold underline"`) into a style. */
export function parseFontStyle(text) {
  const tokens = typeof text === "string" ? text.split(/\s+/).filter(Boolean) : [];
  return {
    fontStyle: tokens.includes("italic") ? "italic" : null,
    fontWeight: tokens.includes("bold") ? 700 : null,
    underline: tokens.includes("underline"),
  };
}

/** A selector component matches a scope when equal, or a dot-boundary prefix of it. */
function componentMatches(component, scope) {
  return component === scope || scope.startsWith(`${component}.`);
}

/**
 * Parse one comma-split TextMate selector into space-separated components,
 * or null if it should be ignored (an exclusion `-selector`, or one using
 * `|`, `(`, `>` — none of which the Omarchy templates emit).
 */
function parseSelector(selector) {
  const trimmed = selector.trim();
  if (trimmed === "" || trimmed.startsWith("-") || /[|()>]/.test(trimmed)) return null;
  const components = trimmed.split(/\s+/).filter(Boolean);
  return components.length > 0 ? components : null;
}

/**
 * Does `components` match `scopeStack` with its last component landing at
 * `endIndex`, and each earlier component matching some earlier index in
 * order (descendant matching)? Matches earlier components greedily,
 * searching backward for the nearest eligible scope.
 */
function selectorMatchesAt(components, scopeStack, endIndex) {
  let pos = endIndex;
  for (let c = components.length - 1; c >= 0; c--) {
    if (c === components.length - 1) {
      if (!componentMatches(components[c], scopeStack[pos])) return false;
      continue;
    }
    let found = -1;
    for (let k = pos - 1; k >= 0; k--) {
      if (componentMatches(components[c], scopeStack[k])) {
        found = k;
        break;
      }
    }
    if (found === -1) return false;
    pos = found;
  }
  return true;
}

/**
 * Find the deepest stack position a selector matches at, and how specific
 * its last component is (dot-segment count). Returns null if it does not
 * match at all.
 */
function matchSelector(components, scopeStack) {
  for (let end = scopeStack.length - 1; end >= 0; end--) {
    if (selectorMatchesAt(components, scopeStack, end)) {
      const last = components[components.length - 1];
      return { index: end, segments: last.split(".").length };
    }
  }
  return null;
}

/** Is `candidate` a stronger match than `current` (which may be null)? */
function stronger(candidate, current) {
  if (!current) return true;
  if (candidate.index !== current.index) return candidate.index > current.index;
  if (candidate.segments !== current.segments) return candidate.segments > current.segments;
  // Same stack depth, same specificity: the later rule wins ties. Callers
  // only compare candidates in rule order, so a tie here always means
  // `candidate` is the later rule.
  return true;
}

/**
 * Resolve a TextMate scope stack (outermost first, e.g.
 * `["source.js", "meta.function.js", "entity.name.function.js"]`) against a
 * VS Code theme's `tokenColors`, approximating VS Code's own matching:
 *
 * 1. Each rule's `scope` is a list of selectors (commas already split by
 *    readTheme). A selector is space-separated components. Selectors
 *    starting with `-` (exclusion) or containing `|`, `(`, `>` are ignored
 *    — the Omarchy templates use none of these.
 * 2. A component matches a scope when it equals the scope, or is a
 *    dot-boundary prefix of it (`entity.name` matches
 *    `entity.name.function.js`, not `entity.names`).
 * 3. A selector matches the stack when its *last* component matches some
 *    scope at index `i`, and each earlier component matches some earlier
 *    scope, in order (descendant matching).
 * 4. Specificity of a match is `(i, segmentsMatched, ruleIndex)`: a deeper
 *    stack position wins, then a longer (more specific) last component,
 *    then a later rule wins ties. `foreground` and `fontStyle` are each
 *    resolved independently — the best matching rule that *sets*
 *    `foreground` gives the colour, the best that *sets* `fontStyle` gives
 *    the style (an explicit `""` fontStyle resets to none).
 * 5. No rule sets a foreground → the theme's `editor.foreground` colour.
 *
 * Throws if `vscode` is null (readTheme found no vscode-theme.json).
 */
export function vscodeScopeStyle(vscode, scopes) {
  if (!vscode) throw new Error("no VS Code theme loaded");
  const scopeStack = Array.isArray(scopes) ? scopes : [];

  let bestColor = null;
  let bestFontStyle = null;

  vscode.tokenColors.forEach((rule, ruleIndex) => {
    const selectors = Array.isArray(rule.scope) ? rule.scope : [];
    let ruleBest = null;
    for (const selector of selectors) {
      const components = parseSelector(selector);
      if (!components) continue;
      const match = matchSelector(components, scopeStack);
      if (!match) continue;
      if (stronger(match, ruleBest)) ruleBest = match;
    }
    if (!ruleBest) return;

    const settings = rule.settings ?? {};
    if (settings.foreground !== undefined) {
      const candidate = { ...ruleBest, ruleIndex, value: settings.foreground };
      if (stronger(candidate, bestColor)) bestColor = candidate;
    }
    if (settings.fontStyle !== undefined) {
      const candidate = { ...ruleBest, ruleIndex, value: settings.fontStyle };
      if (stronger(candidate, bestFontStyle)) bestFontStyle = candidate;
    }
  });

  const color = bestColor ? bestColor.value : vscode.colors?.["editor.foreground"] ?? null;
  const { fontStyle, fontWeight, underline } = parseFontStyle(bestFontStyle ? bestFontStyle.value : "");
  return { color, fontStyle, fontWeight, underline };
}
