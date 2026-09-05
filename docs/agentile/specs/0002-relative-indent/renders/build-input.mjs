#!/usr/bin/env node
// Builds the input JSON app/Main.qml's render mode consumes, for the
// spec 0002 (relative indent) evidence renders: `deep.js` (eight lines,
// six tabs deep, one nested block two tabs deeper) run through the same
// `prepareSnap` the live CLI (`lib/snap.mjs`) calls, once with `dedent`
// bypassed (--mode before, to show the dead indent) and once normally
// (--mode after). Not part of the shipped module — a one-off script for
// this spec's evidence, mirroring what `lib/snap.mjs`'s CLI + `writeInput`
// do, since the CLI itself has no flag to bypass dedent.
//
// Usage: node build-input.mjs --mode before|after --out <input.json>
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../../..");

const { prepareSnap } = await import(resolve(ROOT, "lib/snap.mjs"));
const { buildInput } = await import(resolve(ROOT, "lib/input.mjs"));
const { LANGUAGES } = await import(resolve(ROOT, "lib/language.mjs"));
const { readTheme } = await import(resolve(ROOT, "lib/theme.mjs"));

function parseArgs(argv) {
  const args = { mode: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode") args.mode = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (args.mode !== "before" && args.mode !== "after") {
  console.error("usage: build-input.mjs --mode before|after --out <input.json>");
  process.exit(2);
}
if (!args.out) {
  console.error("usage: build-input.mjs --mode before|after --out <input.json>");
  process.exit(2);
}

const text = readFileSync(join(HERE, "deep.js"), "utf8");
const themeDir = join(ROOT, "tests/fixtures/themes/gruvbox-dark/theme");
const theme = readTheme(themeDir);

// mode "before": a no-op dedentFn, so the frame renders the selection's
// raw absolute indent, dead space and all. mode "after": prepareSnap's
// real default (lib/indent.mjs's dedent) — the flow this spec ships.
const dedentFn = args.mode === "before" ? (t) => ({ text: t, removed: "" }) : undefined;

const result = prepareSnap({
  text,
  windowClass: undefined,
  title: undefined,
  language: "javascript",
  theme,
  root: ROOT,
  ...(dedentFn ? { dedentFn } : {}),
});

const input = buildInput({ snap: result.snap, theme });
input.warnings = result.warnings;
input.languages = Object.keys(LANGUAGES);
input.detected = result.detected;
writeFileSync(args.out, JSON.stringify(input));
console.log(`wrote ${args.out} (mode=${args.mode}, removedIndent=${JSON.stringify(result.detected.removedIndent)})`);
