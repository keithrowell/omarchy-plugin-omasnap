import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOptionJson, firstGradientColour, firstCssNumber, readHyprlandLook, OMARCHY_DEFAULTS } from "../lib/hypr.mjs";

// Recorded `hyprctl getoption -j <option>` output (plan's "Environment
// facts", taken from a live gruvbox-dark desktop: border 2, rounding 6,
// gaps out 10, gaps in 5, active border #7daea3, shadow off).
const RECORDED = {
  "general:border_size": '{"option": "general:border_size", "int": 2, "set": true }',
  "decoration:rounding": '{"option": "decoration:rounding", "int": 6, "set": true }',
  "general:gaps_out": '{"option": "general:gaps_out", "css": "10 10 10 10", "set": true }',
  "general:gaps_in": '{"option": "general:gaps_in", "css": "5 5 5 5", "set": true }',
  "general:col.active_border": '{"option": "general:col.active_border", "gradient": "ff7daea3 0deg", "set": true }',
  "decoration:shadow:enabled": '{"option": "decoration:shadow:enabled", "bool": false, "set": true }',
};

function recordedRun(option) {
  return RECORDED[option];
}

// --- parseOptionJson ---------------------------------------------------------

test("parseOptionJson parses each recorded option line", () => {
  assert.deepEqual(parseOptionJson(RECORDED["general:border_size"]), { option: "general:border_size", int: 2, set: true });
  assert.deepEqual(parseOptionJson(RECORDED["decoration:rounding"]), { option: "decoration:rounding", int: 6, set: true });
  assert.deepEqual(parseOptionJson(RECORDED["general:gaps_out"]), { option: "general:gaps_out", css: "10 10 10 10", set: true });
  assert.deepEqual(parseOptionJson(RECORDED["general:gaps_in"]), { option: "general:gaps_in", css: "5 5 5 5", set: true });
  assert.deepEqual(parseOptionJson(RECORDED["general:col.active_border"]), {
    option: "general:col.active_border",
    gradient: "ff7daea3 0deg",
    set: true,
  });
  assert.deepEqual(parseOptionJson(RECORDED["decoration:shadow:enabled"]), { option: "decoration:shadow:enabled", bool: false, set: true });
});

test("parseOptionJson returns null for garbage, empty, and non-object JSON", () => {
  assert.equal(parseOptionJson("not json"), null);
  assert.equal(parseOptionJson(""), null);
  assert.equal(parseOptionJson(undefined), null);
  assert.equal(parseOptionJson("42"), null);
  assert.equal(parseOptionJson("[1,2]"), null);
});

// --- firstGradientColour -----------------------------------------------------

test("firstGradientColour: one stop with alpha and an angle", () => {
  assert.equal(firstGradientColour("ff7daea3 0deg"), "#7daea3");
});

test("firstGradientColour: a different alpha/colour pair", () => {
  assert.equal(firstGradientColour("aa595959 0deg"), "#595959");
});

test("firstGradientColour: two stops, only the first is used", () => {
  assert.equal(firstGradientColour("ff112233 ff445566 45deg"), "#112233");
});

test("firstGradientColour: six hex digits (no alpha) is used as-is", () => {
  assert.equal(firstGradientColour("7daea3"), "#7daea3");
});

test("firstGradientColour: empty string, nonsense, and non-strings are null", () => {
  assert.equal(firstGradientColour(""), null);
  assert.equal(firstGradientColour("nonsense"), null);
  assert.equal(firstGradientColour(null), null);
  assert.equal(firstGradientColour(undefined), null);
});

// --- firstCssNumber ----------------------------------------------------------

test("firstCssNumber: a four-number quad takes the first", () => {
  assert.equal(firstCssNumber("10 10 10 10"), 10);
});

test("firstCssNumber: fewer numbers still takes the first", () => {
  assert.equal(firstCssNumber("3 4"), 3);
  assert.equal(firstCssNumber("12"), 12);
});

test("firstCssNumber: garbage and non-strings are null", () => {
  assert.equal(firstCssNumber("x"), null);
  assert.equal(firstCssNumber(""), null);
  assert.equal(firstCssNumber(null), null);
});

// --- readHyprlandLook ---------------------------------------------------------

test("readHyprlandLook: a fully-answering hyprctl gives the live look, source hyprctl", () => {
  const look = readHyprlandLook({ run: recordedRun, accent: "#ffffff" });
  assert.deepEqual(look, {
    borderSize: 2,
    rounding: 6,
    gapsOut: 10,
    gapsIn: 5,
    activeBorder: "#7daea3",
    shadowEnabled: false,
    source: "hyprctl",
  });
});

test("readHyprlandLook: a run that throws for every option falls back to defaults, activeBorder is the theme accent", () => {
  const look = readHyprlandLook({
    run: () => {
      throw new Error("hyprctl: command not found");
    },
    accent: "#7daea3",
  });
  assert.deepEqual(look, { ...OMARCHY_DEFAULTS, activeBorder: "#7daea3", source: "defaults" });
});

test("readHyprlandLook: a run that throws for just one option still falls back entirely (never mixes live and default values)", () => {
  const look = readHyprlandLook({
    run: (option) => {
      if (option === "decoration:rounding") throw new Error("boom");
      return recordedRun(option);
    },
    accent: "#123456",
  });
  assert.equal(look.source, "defaults");
  assert.deepEqual(look, { ...OMARCHY_DEFAULTS, activeBorder: "#123456", source: "defaults" });
});

test("readHyprlandLook: one option's answer is unparseable — that key defaults, the rest stay live, source stays hyprctl", () => {
  const look = readHyprlandLook({
    run: (option) => {
      if (option === "general:col.active_border") return "not json";
      return recordedRun(option);
    },
    accent: "#abcdef",
  });
  assert.equal(look.source, "hyprctl");
  assert.equal(look.activeBorder, "#abcdef");
  assert.equal(look.borderSize, 2);
  assert.equal(look.rounding, 6);
  assert.equal(look.gapsOut, 10);
  assert.equal(look.gapsIn, 5);
  assert.equal(look.shadowEnabled, false);
});

test("readHyprlandLook: an out-of-range border size clamps to 20", () => {
  const look = readHyprlandLook({
    run: (option) => (option === "general:border_size" ? '{"option": "general:border_size", "int": 999, "set": true }' : recordedRun(option)),
    accent: "#000000",
  });
  assert.equal(look.borderSize, 20);
});

test("readHyprlandLook: an out-of-range rounding clamps to 64", () => {
  const look = readHyprlandLook({
    run: (option) => (option === "decoration:rounding" ? '{"option": "decoration:rounding", "int": 500, "set": true }' : recordedRun(option)),
    accent: "#000000",
  });
  assert.equal(look.rounding, 64);
});

test("readHyprlandLook: an out-of-range gaps_out clamps to 200", () => {
  const look = readHyprlandLook({
    run: (option) => (option === "general:gaps_out" ? '{"option": "general:gaps_out", "css": "999 999 999 999", "set": true }' : recordedRun(option)),
    accent: "#000000",
  });
  assert.equal(look.gapsOut, 200);
});

test("readHyprlandLook: the real hyprctl (default run) does not throw when invoked (may be defaults or live, depending on the host)", () => {
  assert.doesNotThrow(() => readHyprlandLook({ accent: "#7daea3" }));
});
