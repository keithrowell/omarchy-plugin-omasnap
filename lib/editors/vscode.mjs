// VS Code adapter — see `lib/editors/registry.mjs` for the adapter
// interface every file in this directory implements.

import { highlight as highlightVscode } from "../highlight/vscode.mjs";
import { readEditorFont, resolveFontFamily } from "../fonts.mjs";
import { EDITOR_CLASSES, filenameFromTitle } from "../title.mjs";

export const vscode = {
  id: "vscode",

  async detect({ windowClass }) {
    return EDITOR_CLASSES.vscode.includes(windowClass) ? {} : null;
  },

  async resolveSelection() {
    return null; // no override: use the Wayland primary selection
  },

  async highlight({ text, language, theme, root }) {
    // `null` (no vscode-theme.json, or no installed grammar for this
    // language — see lib/vscode-extensions.mjs) means "the registry's
    // universal fallback highlighter should run instead," not "highlight
    // failed" — the registry, not this adapter, owns that fallback.
    return highlightVscode({ text, language, theme, root });
  },

  font() {
    const raw = readEditorFont("vscode");
    const resolved = resolveFontFamily(raw.family);
    return { family: resolved.family, size: raw.size };
  },

  filenameFromTitle(title) {
    return filenameFromTitle(title, "vscode");
  },
};
