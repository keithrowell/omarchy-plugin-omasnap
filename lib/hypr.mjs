// Reads this desktop's live Hyprland "look" — border, rounding, gaps, the
// active border colour, and whether shadows are on — so `app/Snap.qml`'s
// chrome matches the tiles Hyprland itself draws, per ADR-0001's "every
// colour from the theme" principle extended to chrome geometry (see the
// plan for the "omarchy-window-chrome" spec).
//
// Pure ES module: no Qt, no caching (every call re-reads `hyprctl`, so a
// live `hyprctl reload`/theme switch is picked up on the next snap). The
// only subprocess here is `hyprctl getoption -j <option>` with a fixed,
// single-argument-per-call argv — never built from selection text or any
// other untrusted input.

import { execFileSync } from "node:child_process";

/** Omarchy's own defaults, used whenever `hyprctl` is unavailable, fails, or is not under Hyprland at all. `activeBorder` is the caller's theme accent, not listed here. */
export const OMARCHY_DEFAULTS = { borderSize: 2, rounding: 0, gapsOut: 10, gapsIn: 5, shadowEnabled: false };

const CLAMP = {
  borderSize: [0, 20],
  rounding: [0, 64],
  gapsOut: [0, 200],
  gapsIn: [0, 200],
};

/** `hyprctl getoption -j <option>`'s stdout to the one value key it set, or null on unparseable/empty input. */
export function parseOptionJson(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return parsed;
}

/** A single 6-hex-digit colour, no alpha. */
const HEX6 = /^[0-9a-fA-F]{6}$/;
/** One gradient stop: 8 hex digits (aarrggbb) or 6 (rrggbb, no alpha). */
const GRADIENT_STOP = /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/**
 * Hyprland's `col.active_border`-shaped gradient string (e.g. `"ff7daea3
 * 0deg"`, or multiple space-separated stops each optionally ending in an
 * angle) to the first stop's colour as `#rrggbb`, dropping any leading alpha
 * pair. Returns null for anything that doesn't look like a gradient string.
 */
export function firstGradientColour(gradient) {
  if (typeof gradient !== "string") return null;
  const trimmed = gradient.trim();
  if (trimmed === "") return null;
  const firstToken = trimmed.split(/\s+/)[0];
  if (!GRADIENT_STOP.test(firstToken)) return null;
  const hex = firstToken.length === 8 ? firstToken.slice(2) : firstToken;
  if (!HEX6.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

/**
 * Hyprland's `gaps_out`/`gaps_in`-shaped CSS quad string (`"top right bottom
 * left"`, or fewer numbers) to its first number. Returns null when the first
 * token is not a plain integer.
 */
export function firstCssNumber(css) {
  if (typeof css !== "string") return null;
  const trimmed = css.trim();
  if (trimmed === "") return null;
  const firstToken = trimmed.split(/\s+/)[0];
  if (!/^\d+$/.test(firstToken)) return null;
  return Number(firstToken);
}

function clamp(value, key) {
  const [lo, hi] = CLAMP[key];
  return Math.max(lo, Math.min(hi, value));
}

function defaultRun(option) {
  // A hung/unresponsive hyprctl must not hang a snap forever; readHyprlandLook
  // already falls back to defaults on any throw, so a timeout just turns
  // "stuck" into the same "not answering" case as "missing"/"failed".
  return execFileSync("hyprctl", ["getoption", "-j", option], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 1000 });
}

/** `raw` text's `int` field, clamped; null if the text doesn't parse or has no `int`. */
function extractInt(text, key) {
  const parsed = parseOptionJson(text);
  if (!parsed || typeof parsed.int !== "number") return null;
  return clamp(parsed.int, key);
}

/** `raw` text's `css` field's first number, clamped; null if it doesn't parse. */
function extractCssNumber(text, key) {
  const parsed = parseOptionJson(text);
  if (!parsed || typeof parsed.css !== "string") return null;
  const value = firstCssNumber(parsed.css);
  return value === null ? null : clamp(value, key);
}

/** `raw` text's `gradient` field's first stop as `#rrggbb`; null if it doesn't parse. */
function extractGradientColour(text) {
  const parsed = parseOptionJson(text);
  if (!parsed || typeof parsed.gradient !== "string") return null;
  return firstGradientColour(parsed.gradient);
}

/** `raw` text's `bool` field; null if it doesn't parse. */
function extractBool(text) {
  const parsed = parseOptionJson(text);
  if (!parsed || typeof parsed.bool !== "boolean") return null;
  return parsed.bool;
}

/**
 * Read this desktop's Hyprland "look": `{ borderSize, rounding, gapsOut,
 * gapsIn, activeBorder, shadowEnabled, source }`, `source` being
 * `"hyprctl"` when `run` answered every call (even if some answers were
 * unparseable — see below) and `"defaults"` when `run` itself threw for any
 * option (missing binary, not under Hyprland): that is treated as "this
 * desktop has no Hyprland to ask" and the whole result falls back to
 * `OMARCHY_DEFAULTS` plus `activeBorder: accent`, rather than mixing live
 * and default values.
 *
 * A `run` that *answers* but with unparseable/unexpected JSON for one
 * option only defaults that key — the other, well-formed answers still
 * apply, and `source` stays `"hyprctl"` (the desktop is there; one option's
 * shape was just unrecognised).
 *
 * `accent` (the theme's `colors.accent`) is required: it is `activeBorder`'s
 * fallback, and the value used whenever the whole read falls back to
 * `OMARCHY_DEFAULTS`. `run(option)` defaults to a real `hyprctl getoption -j
 * <option>` call; tests inject a fake to avoid depending on a live desktop.
 */
export function readHyprlandLook({ run = defaultRun, accent } = {}) {
  let raw;
  try {
    raw = {
      borderSize: run("general:border_size"),
      rounding: run("decoration:rounding"),
      gapsOut: run("general:gaps_out"),
      gapsIn: run("general:gaps_in"),
      activeBorder: run("general:col.active_border"),
      shadowEnabled: run("decoration:shadow:enabled"),
    };
  } catch {
    return { ...OMARCHY_DEFAULTS, activeBorder: accent, source: "defaults" };
  }

  const borderSize = extractInt(raw.borderSize, "borderSize") ?? OMARCHY_DEFAULTS.borderSize;
  const rounding = extractInt(raw.rounding, "rounding") ?? OMARCHY_DEFAULTS.rounding;
  const gapsOut = extractCssNumber(raw.gapsOut, "gapsOut") ?? OMARCHY_DEFAULTS.gapsOut;
  const gapsIn = extractCssNumber(raw.gapsIn, "gapsIn") ?? OMARCHY_DEFAULTS.gapsIn;
  const activeBorder = extractGradientColour(raw.activeBorder) ?? accent;
  const shadowEnabled = extractBool(raw.shadowEnabled) ?? OMARCHY_DEFAULTS.shadowEnabled;

  return { borderSize, rounding, gapsOut, gapsIn, activeBorder, shadowEnabled, source: "hyprctl" };
}
