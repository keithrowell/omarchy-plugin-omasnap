#!/usr/bin/env bash
# Spike-only. Invoked exactly the way a Hyprland `exec` keybinding would
# invoke a real omasnap binding: writes the active window and the primary
# selection to files, for scripts/input-path.sh's Q2.
set -euo pipefail
OUT_DIR="$1"
hyprctl activewindow -j > "$OUT_DIR/probe-activewindow.json" 2>"$OUT_DIR/probe-activewindow.err"
wl-paste --primary --no-newline > "$OUT_DIR/probe-primary.txt" 2>"$OUT_DIR/probe-primary.err"
echo "probe-exit=$?" > "$OUT_DIR/probe-exit.txt"
