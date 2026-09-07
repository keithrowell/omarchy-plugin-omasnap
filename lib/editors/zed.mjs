// Zed adapter — see `lib/editors/registry.mjs` for the adapter interface
// every file in this directory implements.

import { highlight as highlightZed } from "../highlight/zed.mjs";
import { readEditorFont, resolveFontFamily } from "../fonts.mjs";
import { EDITOR_CLASSES, filenameFromTitle } from "../title.mjs";

export const zed = {
  id: "zed",

  async detect({ windowClass }) {
    return EDITOR_CLASSES.zed.includes(windowClass) ? {} : null;
  },

  async resolveSelection() {
    return null; // no override: use the Wayland primary selection, like every non-RPC editor
  },

  async highlight({ text, language, theme, root }) {
    return highlightZed({ text, language, theme, root }); // never null — degrades to plain spans internally
  },

  font() {
    const raw = readEditorFont("zed");
    const resolved = resolveFontFamily(raw.family);
    return { family: resolved.family, size: raw.size };
  },

  filenameFromTitle(title) {
    return filenameFromTitle(title, "zed");
  },
};
