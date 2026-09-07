// The catch-all adapter — always matches, last in `EDITORS`. A terminal, a
// browser, or any other focused app that isn't Zed or VS Code lands here:
// no override, and `highlight()` always defers to the registry's universal
// fallback highlighter. See `lib/editors/registry.mjs` for the adapter
// interface.

import { readEditorFont, resolveFontFamily } from "../fonts.mjs";

export const other = {
  id: "other",

  async detect() {
    return {}; // catch-all: matches anything the earlier adapters didn't
  },

  async resolveSelection() {
    return null;
  },

  async highlight() {
    return null; // defer to the registry's universal fallback highlighter
  },

  font() {
    // No editor settings file to read for "some other app" — Zed's is the
    // existing stand-in (this predates the registry; kept as-is rather
    // than changed as a side effect of this refactor).
    const raw = readEditorFont("zed");
    const resolved = resolveFontFamily(raw.family);
    return { family: resolved.family, size: raw.size };
  },

  filenameFromTitle() {
    return null; // never guessed for an unrecognised app
  },
};
