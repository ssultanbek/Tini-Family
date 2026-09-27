#!/usr/bin/env bash
# One command for demo day: build the game, replay a recorded run through the real engine,
# open the game in a Chrome app window. Works with Wi-Fi off. Ctrl+C stops everything.
#
#   scripts/demo.sh [speed] [recording.jsonl]
#
# speed: replay speed, default 2.
# recording: default mock/recordings/demo-main.jsonl, falling back to candidate-demo-2.jsonl.
set -euo pipefail
set -m # background jobs get their own process group, so cleanup can stop tsx and its child

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEED="${1:-2}"
REC="${2:-}"
PORT=4000
URL="http://localhost:$PORT"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="${TMPDIR:-/tmp}/tini-demo-chrome"

say() { printf '\033[1m[demo]\033[0m %s\n' "$*"; }
die() { say "$*"; exit 1; }

if [[ -z "$REC" ]]; then
  REC="$ROOT/mock/recordings/demo-main.jsonl"
  if [[ ! -f "$REC" ]]; then
    say "demo-main.jsonl not found; falling back to candidate-demo-2.jsonl"
    REC="$ROOT/mock/recordings/candidate-demo-2.jsonl"
  fi
fi
[[ "$REC" = /* ]] || REC="$PWD/$REC"
[[ -f "$REC" ]] || die "recording not found: $REC"
[[ "$SPEED" =~ ^[0-9]+([.][0-9]+)?$ ]] || die "speed must be a number (got '$SPEED')"

if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  die "port $PORT is already in use (another engine or the mock?). Stop it first."
fi

# Install when node_modules is missing or older than the lockfile (e.g. after a pull added a package).
for dir in engine game; do
  installed="$ROOT/$dir/node_modules/.package-lock.json"
  if [[ ! -f "$installed" || "$ROOT/$dir/package-lock.json" -nt "$installed" ]]; then
    say "installing $dir/ packages (needs internet; only after a fresh clone or a package change)"
    (cd "$ROOT/$dir" && npm install --no-audit --no-fund)
    touch "$installed"
  fi
done

say "building the game"
(cd "$ROOT/game" && npm run build --silent) || die "game build failed"

ENGINE_PID=""
CHROME_PID=""
cleanup() {
  trap - INT TERM EXIT
  echo
  say "stopping"
  [[ -n "$CHROME_PID" ]] && kill "$CHROME_PID" 2>/dev/null || true
  if [[ -n "$ENGINE_PID" ]]; then
    kill -INT -- "-$ENGINE_PID" 2>/dev/null || true
    for _ in $(seq 1 30); do kill -0 "$ENGINE_PID" 2>/dev/null || break; sleep 0.1; done
    kill -KILL -- "-$ENGINE_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  say "stopped"
}
trap cleanup INT TERM EXIT

say "replaying $(basename "$REC") at ${SPEED}x"
(cd "$ROOT/engine" && exec node_modules/.bin/tsx src/main.ts --mode replay --recording "$REC" --speed "$SPEED") &
ENGINE_PID=$!

for _ in $(seq 1 100); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break
  kill -0 "$ENGINE_PID" 2>/dev/null || die "engine exited before it was ready"
  sleep 0.2
done
curl -sf -o /dev/null "http://127.0.0.1:$PORT/" || die "engine did not answer on :$PORT"
say "engine ready on $URL"

if [[ -x "$CHROME" ]]; then
  "$CHROME" --app="$URL" --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
    --window-size=1440,900 >/dev/null 2>&1 &
  CHROME_PID=$!
  disown "$CHROME_PID" # cleanup kills it by pid; keeps bash from printing a job status line
  say "opened Chrome app window (Ctrl+C here stops everything)"
else
  open "$URL"
  say "Chrome not found; opened $URL in the default browser (Ctrl+C here stops the engine)"
fi

wait "$ENGINE_PID"
