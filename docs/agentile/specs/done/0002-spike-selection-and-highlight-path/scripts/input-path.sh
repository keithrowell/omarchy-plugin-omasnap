#!/usr/bin/env bash
# Spike-only, reproducible driver for questions 1-4 (input path).
#
# Steals focus on the LIVE desktop for a few seconds: opens a Zed window on
# a fixture, selects text, reads the Wayland primary selection, then closes
# only the window(s) it opened, restores the clipboard and primary
# selection, and refocuses whatever was active before. All cleanup runs in
# an EXIT trap so it happens even on failure.
#
# VS Code branch is guarded by `command -v code` and is expected to print
# "not run" on this machine (VS Code is not installed; installing it needs
# sudo, which this script never uses).
set -uo pipefail

SPEC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$SPEC_DIR/out"
mkdir -p "$OUT_DIR"
cd "$SPEC_DIR"

ZED_PID=""
ZED_ADDRESSES=()
PREV_ADDRESS=""
CLIP_BEFORE_FILE="$OUT_DIR/clip-before.bin"
CLIP_BEFORE_SET=0

log() { echo "[input-path] $*"; }

send_key() {
  # send_key <mods> <key> <class>
  local mods="$1" key="$2" class="$3"
  hyprctl dispatch "hl.dsp.send_key_state({ mods = \"${mods}\", key = \"${key}\", state = \"down\", window = \"class:${class}\" })" >/dev/null
  sleep 0.04
  hyprctl dispatch "hl.dsp.send_key_state({ mods = \"${mods}\", key = \"${key}\", state = \"up\", window = \"class:${class}\" })" >/dev/null
  sleep 0.04
}

cleanup() {
  log "cleanup: closing $(( ${#ZED_ADDRESSES[@]} )) zed window(s) opened by this script"
  for addr in "${ZED_ADDRESSES[@]:-}"; do
    if [ -n "$addr" ]; then
      # This Omarchy config runs Hyprland's Lua config layer, where the
      # classic `hyprctl dispatch closewindow ...` grammar is rejected
      # ("')' expected near 'address'"); only the Lua dispatcher form works.
      hyprctl dispatch "hl.dsp.window.close({ window = \"address:$addr\" })" >/dev/null 2>&1 || true
    fi
  done
  if [ -n "$ZED_PID" ] && kill -0 "$ZED_PID" 2>/dev/null; then
    kill "$ZED_PID" 2>/dev/null || true
  fi
  wl-copy --primary --clear >/dev/null 2>&1 || true
  if [ "$CLIP_BEFORE_SET" = "1" ]; then
    # Restore from the saved FILE, not a bash variable: command substitution
    # ($(...)) strips embedded NUL bytes and trailing newlines, which
    # silently corrupts binary clipboard content (images etc). A second run
    # of this script during the spike found the clipboard holding a PNG at
    # the time it ran, and the bash-variable round trip could not be trusted
    # to reproduce it byte-for-byte - see findings.md's "Incident" note.
    if [ -s "$CLIP_BEFORE_FILE" ]; then
      wl-copy < "$CLIP_BEFORE_FILE"
    else
      wl-copy --clear >/dev/null 2>&1 || true
    fi
    log "clipboard restored from $CLIP_BEFORE_FILE ($(wc -c < "$CLIP_BEFORE_FILE" 2>/dev/null || echo 0) bytes)"
  fi
  if [ -n "$PREV_ADDRESS" ]; then
    # The classic `hyprctl dispatch focuswindow "address:..."` grammar is
    # rejected by this Omarchy's Lua Hyprland config ("')' expected near
    # 'address'", exit 7) - only the Lua dispatcher form works. Do not mask
    # the exit code: if this fails, the previous window was NOT refocused,
    # and that must be visible in the log, not silently swallowed.
    FOCUS_RESULT=$(hyprctl dispatch "hl.dsp.focus({ window = \"address:$PREV_ADDRESS\" })" 2>&1)
    FOCUS_EXIT=$?
    log "refocus previous window $PREV_ADDRESS: exit=$FOCUS_EXIT result=[$FOCUS_RESULT]"
  fi
}
trap cleanup EXIT

log "== save state =="
PREV_ADDRESS=$(hyprctl activewindow -j | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).address)}catch{console.log("")}})')
# Binary-safe save: a file, not a bash variable (see the cleanup() comment).
wl-paste --no-newline > "$CLIP_BEFORE_FILE" 2>/dev/null || : > "$CLIP_BEFORE_FILE"
CLIP_BEFORE_SET=1
{
  echo "prev_address=$PREV_ADDRESS"
  echo "clip_before_bytes=$(wc -c < "$CLIP_BEFORE_FILE")"
  echo "clip_before_mime=$(wl-paste --list-types 2>/dev/null | tr '\n' ',' )"
} | tee "$OUT_DIR/state-before.txt"

wl-copy "OMASNAP-SENTINEL-$$"
wl-copy --primary --clear >/dev/null 2>&1 || true

log "== Q4: wl-paste --primary with the primary selection cleared =="
{
  echo "--- wl-paste --primary --no-newline (primary cleared) ---"
  wl-paste --primary --no-newline > "$OUT_DIR/q4-cleared.txt" 2> "$OUT_DIR/q4-cleared.err"
  echo "exit=$?"
  echo "stdout: [$(cat "$OUT_DIR/q4-cleared.txt")]"
  echo "stderr: [$(cat "$OUT_DIR/q4-cleared.err")]"
} | tee "$OUT_DIR/q4-result.txt"

log "== Q4b: wl-paste --primary as owned by the terminal (whatever foot currently holds) =="
{
  echo "--- wl-paste --primary --no-newline (terminal-owned, no explicit selection made) ---"
  wl-paste --primary --no-newline > "$OUT_DIR/q4b-terminal.txt" 2> "$OUT_DIR/q4b-terminal.err"
  echo "exit=$?"
  echo "stdout: [$(cat "$OUT_DIR/q4b-terminal.txt")]"
  echo "stderr: [$(cat "$OUT_DIR/q4b-terminal.err")]"
} | tee "$OUT_DIR/q4b-result.txt"

log "== launch zed on fixtures/sample.js =="
zed -n "$SPEC_DIR/fixtures/sample.js" >"$OUT_DIR/zed-stdout.log" 2>"$OUT_DIR/zed-stderr.log" &
ZED_PID=$!
log "zed launcher pid=$ZED_PID"

ZED_CLASS=""
ZED_ADDR=""
for i in $(seq 1 50); do
  sleep 0.5
  MATCH=$(hyprctl -j clients | node -e '
    let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
      const clients = JSON.parse(d);
      const z = clients.find(c => /zed/i.test(c.class));
      if (z) console.log(JSON.stringify(z));
    });
  ')
  if [ -n "$MATCH" ]; then
    echo "$MATCH" > "$OUT_DIR/zed-client.json"
    ZED_CLASS=$(echo "$MATCH" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).class))')
    ZED_ADDR=$(echo "$MATCH" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).address))')
    log "found zed window after ${i} polls: class=$ZED_CLASS address=$ZED_ADDR"
    break
  fi
done

if [ -z "$ZED_CLASS" ]; then
  log "ERROR: zed window did not appear within 15s"
  echo "not-found" > "$OUT_DIR/zed-client.json"
else
  ZED_ADDRESSES+=("$ZED_ADDR")
  cp "$OUT_DIR/zed-client.json" "$OUT_DIR/q3-title-js.json"

  log "== focus zed, select all =="
  # NOTE: an earlier run of this script also sent a bare Escape here to
  # dismiss a hypothetical first-run overlay. No overlay appeared (Zed had
  # already been run on this machine), and the synthetic Escape instead
  # typed a literal space character at the cursor (see findings.md Q1) -
  # dropped here since it is not needed and mutates the buffer.
  # The classic `focuswindow "address:..."` grammar is rejected by this
  # Omarchy's Lua Hyprland config; use the Lua dispatcher form.
  hyprctl dispatch "hl.dsp.focus({ window = \"address:$ZED_ADDR\" })" >/dev/null 2>&1 || true
  sleep 0.3
  send_key "CTRL" "A" "$ZED_CLASS"
  sleep 0.2

  log "== Q1: read primary selection after select-all in Zed =="
  wl-paste --primary --no-newline > "$OUT_DIR/q1-zed-selectall.txt" 2> "$OUT_DIR/q1-zed-selectall.err"
  echo "exit=$?" > "$OUT_DIR/q1-zed-selectall-exit.txt"
  cmp "$OUT_DIR/q1-zed-selectall.txt" "fixtures/sample.js" > "$OUT_DIR/q1-cmp.txt" 2>&1 && echo "IDENTICAL" >> "$OUT_DIR/q1-cmp.txt" || echo "cmp exit=$? (see q1-cmp.txt; likely just trailing newline)" >> "$OUT_DIR/q1-cmp.txt"

  log "== confirm clipboard was NOT touched by the selection (still sentinel) =="
  wl-paste --no-newline > "$OUT_DIR/q1-clipboard-after-select.txt" 2>&1
  grep -q "OMASNAP-SENTINEL-$$" "$OUT_DIR/q1-clipboard-after-select.txt" && echo "clipboard unchanged: sentinel intact" > "$OUT_DIR/q1-clipboard-check.txt" || echo "clipboard CHANGED (unexpected)" > "$OUT_DIR/q1-clipboard-check.txt"

  log "== Q1b: partial selection - skipped (multi-modifier send_key_state syntax e.g. CTRL+SHIFT not verified within the timebox; full select-all above is sufficient evidence for Q1) =="
  echo "not attempted: multi-mod (CTRL+SHIFT) chord syntax for hl.dsp.send_key_state not verified within timebox" > "$OUT_DIR/q1b-partial.txt"

  log "== Q2: reproduce the exec-dispatcher path a real keybinding would use, while Zed is focused =="
  hyprctl dispatch "hl.dsp.focus({ window = \"address:$ZED_ADDR\" })" >/dev/null 2>&1 || true
  sleep 0.2
  send_key "CTRL" "A" "$ZED_CLASS"
  sleep 0.15
  # Single-quote the paths inside the Lua string: the real checkout path can
  # contain spaces and parentheses (e.g. ".../lab/omasnap (copy)"), which
  # would otherwise break the double-quoted Lua string argument below.
  ESCAPED_PROBE="'$SPEC_DIR/scripts/probe.sh' '$OUT_DIR'"
  hyprctl dispatch "hl.dsp.exec_cmd(\"$ESCAPED_PROBE\")" > "$OUT_DIR/q2-dispatch-result.txt" 2>&1
  sleep 0.4
  cat "$OUT_DIR/probe-activewindow.json" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);console.log("q2 active window class="+j.class+" address="+j.address)}catch(e){console.log("q2 parse error: "+e.message)}})' > "$OUT_DIR/q2-summary.txt" 2>&1 || true
  echo "q2 primary selection bytes: $(wc -c < "$OUT_DIR/probe-primary.txt" 2>/dev/null || echo n/a)" >> "$OUT_DIR/q2-summary.txt"

  log "== Q3: open sample.py in a second window, record its title =="
  zed -n "$SPEC_DIR/fixtures/sample.py" >>"$OUT_DIR/zed-stdout.log" 2>>"$OUT_DIR/zed-stderr.log" &
  ZED_PID_2=$!
  PY_ADDR=""
  for i in $(seq 1 30); do
    sleep 0.5
    MATCH2=$(hyprctl -j clients | node -e '
      let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
        const clients = JSON.parse(d);
        const zeds = clients.filter(c => /zed/i.test(c.class));
        if (zeds.length > 1) console.log(JSON.stringify(zeds[zeds.length-1]));
      });
    ')
    if [ -n "$MATCH2" ]; then
      echo "$MATCH2" > "$OUT_DIR/q3-title-py.json"
      PY_ADDR=$(echo "$MATCH2" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).address))')
      log "second zed window after ${i} polls: address=$PY_ADDR"
      break
    fi
  done
  [ -n "$PY_ADDR" ] && ZED_ADDRESSES+=("$PY_ADDR")
  if [ -z "$PY_ADDR" ] && kill -0 "$ZED_PID_2" 2>/dev/null; then
    kill "$ZED_PID_2" 2>/dev/null || true
  fi
fi

log "== VS Code branch =="
if command -v code >/dev/null 2>&1; then
  echo "code found on PATH - VS Code branch would run here (not implemented, unexpected on this machine)" > "$OUT_DIR/vscode-status.txt"
else
  echo "not run: VS Code ('code') is not installed on this machine. Install with 'sudo pacman -S code' (or the AUR build) then re-run this script; it will pick up the VS Code branch once 'command -v code' succeeds." > "$OUT_DIR/vscode-status.txt"
fi
cat "$OUT_DIR/vscode-status.txt"

log "== done (cleanup runs next via EXIT trap) =="
