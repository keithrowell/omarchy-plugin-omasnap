// Language detection: maps a filename (and, failing that, a shebang) to the
// language id `lib/highlight/zed.mjs` uses to pick a grammar and query set.
//
// Pure ES module: no Qt, no I/O, no network. `LANGUAGES`' `suffixes` are
// taken from each language's Zed `crates/grammars/src/<lang>/config.toml`
// `path_suffixes` (see `vendor/zed-queries/SOURCE.md` for the exact commit
// each was read from), plus a few filenames/shebangs Zed itself recognises
// (`languages/<lang>/config.toml`'s `path_suffixes` for extension-shaped
// filenames like `Gemfile`, and the interpreter names Zed's own shebang
// detection matches for scripts with no extension).

/**
 * id -> { grammar, queries, suffixes, shebangs?, filenames? }
 *
 * `grammar` names the compiled parser under `vendor/grammars/lib/<grammar>.so`;
 * `queries` names the query directory under `vendor/zed-queries/<queries>/`.
 * Several ids share one grammar (Zed parses `.js`/`.jsx`/`.tsx` all with the
 * `tsx` grammar — see `docs/adr/0002-grammar-sourcing.md` and the spike's
 * findings.md Q5) but each still gets its own query set.
 */
export const LANGUAGES = {
  javascript: { grammar: "tsx", queries: "javascript", suffixes: ["js", "mjs", "cjs", "jsx"], shebangs: ["node"] },
  typescript: { grammar: "typescript", queries: "typescript", suffixes: ["ts", "mts", "cts"] },
  tsx: { grammar: "tsx", queries: "tsx", suffixes: ["tsx"] },
  python: { grammar: "python", queries: "python", suffixes: ["py", "pyi", "pyw"], shebangs: ["python", "python3"] },
  rust: { grammar: "rust", queries: "rust", suffixes: ["rs"] },
  c: { grammar: "c", queries: "c", suffixes: ["c", "h"] },
  bash: {
    grammar: "bash",
    queries: "bash",
    suffixes: ["sh", "bash", "zsh"],
    shebangs: ["sh", "bash", "zsh"],
    filenames: [".bashrc", ".zshrc", "PKGBUILD"],
  },
  json: { grammar: "json", queries: "json", suffixes: ["json", "jsonc"] },
  yaml: { grammar: "yaml", queries: "yaml", suffixes: ["yml", "yaml"] },
  markdown: { grammar: "markdown", queries: "markdown", suffixes: ["md", "markdown"] },
  ruby: {
    grammar: "ruby",
    queries: "ruby",
    suffixes: ["rb", "rake", "gemspec"],
    shebangs: ["ruby"],
    filenames: ["Gemfile", "Rakefile"],
  },
  lua: { grammar: "lua", queries: "lua", suffixes: ["lua"], shebangs: ["lua"] },
};

const FILENAME_INDEX = new Map();
const SUFFIX_INDEX = new Map();
const SHEBANG_INDEX = new Map();

for (const [id, config] of Object.entries(LANGUAGES)) {
  for (const filename of config.filenames ?? []) FILENAME_INDEX.set(filename, id);
  for (const suffix of config.suffixes ?? []) SUFFIX_INDEX.set(suffix.toLowerCase(), id);
  for (const shebang of config.shebangs ?? []) SHEBANG_INDEX.set(shebang, id);
}

/** The last path segment, whether the separator is `/` or `\`. */
function basename(filename) {
  const idx = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));
  return idx === -1 ? filename : filename.slice(idx + 1);
}

/** The suffix after the last dot, or null for a dotfile/extensionless name (a leading dot doesn't count). */
function suffixOf(name) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return name.slice(dot + 1);
}

/**
 * Match a `#!` line: `#!/bin/bash` -> "bash"; `#!/usr/bin/env python3` ->
 * "python3" (the argument to `env`, not `env` itself). Trailing digits/dots
 * are stripped as a fallback (`python3` -> `python`) so a version-qualified
 * interpreter still matches.
 */
function shebangLanguage(text) {
  if (typeof text !== "string") return null;
  const firstLine = text.split("\n", 1)[0];
  const match = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(firstLine);
  if (!match) return null;

  const interpreterPath = match[1];
  let candidate = interpreterPath.split("/").pop();
  if (candidate === "env" && match[2]) {
    candidate = match[2].split("/").pop();
  }

  if (SHEBANG_INDEX.has(candidate)) return SHEBANG_INDEX.get(candidate);
  const stripped = candidate.replace(/[0-9.]+$/, "");
  return SHEBANG_INDEX.get(stripped) ?? null;
}

/**
 * Detect a language id for `{ filename, text }`: exact filename match, then
 * suffix (case-insensitive, last dot), then a `#!` shebang on the first
 * line, then `null`. Suffix wins over shebang (a `.py` file with a bogus
 * shebang is still python). Pure — no filesystem access.
 */
export function detectLanguage({ filename, text } = {}) {
  if (typeof filename === "string" && filename !== "") {
    const base = basename(filename);
    if (FILENAME_INDEX.has(base)) return FILENAME_INDEX.get(base);

    const suffix = suffixOf(base);
    if (suffix) {
      const id = SUFFIX_INDEX.get(suffix.toLowerCase());
      if (id) return id;
    }
  }

  return shebangLanguage(text);
}
