import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf8"));

test("manifest.json has the required Omarchy plugin fields", () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.id, "com.keithrowell.omasnap");
  assert.equal(manifest.name, "Omasnap");
  assert.equal(manifest.version, "0.9.0");
  assert.equal(manifest.license, "MIT");
  assert.equal(typeof manifest.author, "string");
  assert.ok(manifest.author.length > 0);
  assert.equal(typeof manifest.description, "string");
  assert.ok(manifest.description.length > 0);
  // ADR-0003: the marketplace's validator requires a non-empty `kinds`
  // array, each with a matching `entryPoints` file that actually exists.
  assert.deepEqual(manifest.kinds, ["service"]);
  assert.deepEqual(manifest.entryPoints, { service: "app/Service.qml" });
  assert.equal(manifest.keepLoaded, true);
  assert.ok(existsSync(resolve(ROOT, manifest.entryPoints.service)));
});
