# Inbox (stubs awaiting shaping)

Anything can go here as a **stub** — a one-line placeholder that is *not yet ready to build*. Capture must be instant: a title, optionally a word about why. No acceptance criteria, no estimate, no triage.

Drop stubs with `/ag-capture <idea>`. Shape them into specs with `/ag-shape`. A stub stays here until it is shaped into a Ready spec, merged into another item, or dropped.

- [ ] VS Code highlighter: TextMate grammars via shiki coloured from vscode-theme.json tokenColors — (captured 2026-09-05)
- [ ] Generic highlighter for non-editor windows, coloured from colors.toml — (captured 2026-09-05)
- [ ] Backdrop variants in the preview: theme gradient, solid darker_background, transparent — (captured 2026-09-05)
- [ ] Spec 0006 names SUPER+ALT+S as the snap binding; that is Omarchy's "move window to scratchpad" default. Spec 0001 shipped SUPER+ALT+SHIFT+S; update 0006's title, criteria and README wording to match — (captured 2026-09-05)
- [x] Spec 0005 must vendor the tsx grammar from zed-industries/tree-sitter-typescript at the commit Zed v1.18.1 pins (e2c53597) for JavaScript; plain tree-sitter-javascript fails to compile Zed's query (spike 0002, Q5) — (captured 2026-09-05) — done in spec 0005
- [x] Spec 0006: read hyprctl activewindow -j defensively; the first read after a dispatch can be a transient window (gcr keyring prompt); sanity-check the class and fall back to the last known editor (spike 0002, Q2) — (captured 2026-09-05) — done in spec 0006 (transient-class guard in lib/snap.mjs)
- [ ] lib/editors.mjs readEditorFont spawns fc-match even when the editor settings supplied family and size; call systemFont only for the missing half to keep the snap path lean (reviewer note, spec 0003) — (captured 2026-09-05)
- [ ] At the desk: take the Zed screenshot for spec 0005's side-by-side record (commands in docs/agentile/specs/0005-zed-highlighter/side-by-side.md, "at the desk" section); the loop could not capture it because the display was locked. Precedence rule already verified statically against Zed source. — (captured 2026-09-06)
- [ ] Header font premise: the Omarchy shell does not read font.family from shell.json or shell.toml; Commons/Style.qml uses fc-match monospace. Decide whether the snap header should follow fc-match monospace instead of the spec's lookup chain (reviewer note, omarchy-window-chrome) — (captured 2026-09-06)
- [ ] Preview window: very wide and very tall content (e.g. 100+ long lines) hits minWindowWidth and the uniform fit scale together, clipping lines horizontally instead of staying fully visible — narrower follow-up to the fix in adaa6b6 — (captured 2026-09-06)
