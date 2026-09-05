#!/usr/bin/env node
// Spike-only. Resolves a list of tree-sitter capture names against the
// Zed theme's `syntax` keys using Zed's dotted-prefix fallback (a.b.c -> a.b -> a).
// Usage: node resolve-captures.mjs <theme-keys.json> <captures.txt> [--fired <query-output.txt>]

import { readFileSync } from "node:fs";

const [, , themeKeysPath, capturesPath, ...rest] = process.argv;
const themeKeys = new Set(JSON.parse(readFileSync(themeKeysPath, "utf8")));
const captures = readFileSync(capturesPath, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

function resolve(capture) {
  const parts = capture.split(".");
  for (let n = parts.length; n > 0; n--) {
    const candidate = parts.slice(0, n).join(".");
    if (themeKeys.has(candidate)) {
      return { resolved: candidate, exact: n === parts.length };
    }
  }
  return null;
}

const exact = [];
const fallback = [];
const unresolved = [];

for (const capture of captures) {
  const result = resolve(capture);
  if (!result) {
    unresolved.push(capture);
  } else if (result.exact) {
    exact.push(capture);
  } else {
    fallback.push(`${capture} -> ${result.resolved}`);
  }
}

console.log(`# declared captures: ${captures.length}`);
console.log(`\n## Exact matches (${exact.length})`);
console.log(exact.join("\n") || "(none)");
console.log(`\n## Resolved by fallback (${fallback.length})`);
console.log(fallback.join("\n") || "(none)");
console.log(`\n## Unresolved (${unresolved.length})`);
console.log(unresolved.join("\n") || "(none)");

const firedIdx = rest.indexOf("--fired");
if (firedIdx !== -1) {
  const firedPath = rest[firedIdx + 1];
  const lines = readFileSync(firedPath, "utf8").split("\n");
  const fired = new Set();
  for (const line of lines) {
    const m = line.match(/capture: \d+ - ([A-Za-z_.]+),/);
    if (m) fired.add(m[1]);
  }
  console.log(`\n# captures that actually fired on the fixture: ${fired.size}`);
  const firedExact = [];
  const firedFallback = [];
  const firedUnresolved = [];
  for (const capture of fired) {
    const result = resolve(capture);
    if (!result) firedUnresolved.push(capture);
    else if (result.exact) firedExact.push(capture);
    else firedFallback.push(`${capture} -> ${result.resolved}`);
  }
  console.log(`\n## Fired: exact (${firedExact.length})`);
  console.log(firedExact.sort().join("\n") || "(none)");
  console.log(`\n## Fired: fallback (${firedFallback.length})`);
  console.log(firedFallback.sort().join("\n") || "(none)");
  console.log(`\n## Fired: unresolved (${firedUnresolved.length})`);
  console.log(firedUnresolved.sort().join("\n") || "(none)");
}
