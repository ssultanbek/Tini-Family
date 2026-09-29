# Tini Family

**Your AI coding agent gets the keys to the room, not the house.**

Tini Family is a local desktop app that sits between you and Claude Code. It has two parts: an
engine that runs on your laptop (bound to 127.0.0.1 only) and a game window in the browser. You
type what you want in a prompt bar, and the app draws what happens as a small yard:

- **Tini** reads your prompt and builds a fence around only what the job needs: the folders you
  named, the web domains it needs (like the npm registry) and a fresh workspace. You approve one
  plain-English card instead of dozens of "Yes" clicks.
- **Tina** inspects folders before they come in and inspects the work after every turn. A problem
  (an API key in the page code, a photo that still carries its owner's name) turns a fence segment
  red, with a plain explanation and a one-click fix. Launch stays locked until every segment is green.
- **The dog** is Claude Code, building inside the yard. One Claude session stays open across turns.

At the end you get an access report covering every turn: what was allowed, blocked, narrowed and fixed.

Built at **ShellHacks 2026**.

## The three fence layers

None of them depends on AI. AI only writes labels and explanations and suggests file subsets, and
code checks every answer.

1. **Staging.** Claude works in a fresh folder under `~/tini-projects/`. Tini copies in only the
   approved files and strips GPS from photos on the way. A photo that can't be proven clean is left
   out. The originals are never touched.
2. **A PreToolUse hook on every action.** Every Read, Write, Edit, Glob, Grep and Bash call is
   checked. Paths are resolved (symlinks included), and anything outside the workspace, or any
   domain not on the list, is denied on the spot with a plain reason.
3. **The macOS sandbox (Seatbelt) as the backstop.** Hooks don't see what a subprocess like `cat`
   does inside Bash. The sandbox denies reads of the home folder except the workspace, allows writes
   only there and allows network only to the listed domains.

If Claude needs something outside the fence, it asks through a `request_access` tool. Tina inspects
the folder first, and you choose: only the matching files (cleaned), the whole folder, or deny.

## Run the demo (no API keys, works offline)

Needs macOS, Node.js (we used Node 25) and Google Chrome. From the repo root:

```bash
scripts/demo.sh            # replay at 2x
scripts/demo.sh 3          # replay at 3x
scripts/demo.sh 2 mock/recordings/demo-backup.jsonl   # another recording
```

The script builds the game, starts the engine in replay mode on `mock/recordings/demo-main.jsonl`
(or `candidate-demo-2.jsonl` if that's missing), waits for port 4000 and opens the game in a Chrome
app window at http://localhost:4000. The engine serves the built game itself. Ctrl+C stops
everything. The first run installs npm packages if `engine/` or `game/` has none; after that it
needs no internet.

A replay is a recording of a real live run, played back through the real engine. It pauses at each
prompt and each choice, so you press Send and click the cards yourself.

## Run it live

Live mode runs real Claude Code sessions on your Mac and costs real API money (a full demo run was
about $1.30). It needs:

- `engine/.env` with `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` (optional `GEMINI_MODEL`). If Gemini
  is down, the AI ladder falls back to Claude Haiku, then to fixed wording.
- The fake demo world: `cd demo-kit && npm install && npm run demo-kit`. It creates
  `~/Clients/Rivera`, `~/Pictures/Jobsite2024`, `~/Documents/Rivera-HR` and `~/tini-demo`, and it
  only ever deletes those four folders when they carry its marker file.
- Optional: `gitleaks` from Homebrew (Tina also runs her own secret patterns).

```bash
cd engine && npm install && npm run live
```

`npm run live` builds the game if it changed, starts the engine with `--mode live --demo` on port
4000 (serving the built game) and opens it in a Chrome app window. Ctrl+C stops it. To run the
pieces by hand: `cd game && npm install && npm run build`, then
`cd engine && npm run engine -- --mode live --demo` and open http://localhost:4000.

`--demo` fires the simulated attack once in turn 1. The dog has a per-turn cost cap (default $2,
`--turn-budget`) and a session cap (default $6, `--session-budget`). `--mode observe` is the
"without the guardian" clip: no fence around the demo folders, so you can see what Claude does
unguarded (keys and other private files stay blocked even then).

Tests: `cd engine && npm test` (fence guard), `npm run test:loop`, `npm run typecheck`.

## What's simulated, what's fake, what's real

- **Simulated:** the `~/.ssh/id_rsa` attack. A harness pushes a Read of that file through the real
  fence checker and shows the real block, labeled "simulated" on screen. The file is never opened.
  (In live runs Claude spotted the planted injection and refused on its own, so the beat wouldn't
  fire reliably without the harness.)
- **Fake:** the whole demo world. Rivera Construction, its photos and GPS tags, the Maps key, the
  driver's license marked SAMPLE, the personal-photo stand-ins and the HR login file are all
  generated on the laptop.
- **Recorded:** the table demo replays a real live run, because a real build takes minutes.
- **Real:** the fence (staging, hook and sandbox), Tina's scans and fixes, the AI ladder, the
  replayed run itself and live mode.

## Repo layout

| Folder | What |
|---|---|
| `engine/` | The engine: Claude Agent SDK runner, Tini (`src/tini/`), Tina (`src/tina/`), the fence guard, the AI ladder, recorder and replay. |
| `game/` | The game window: a 3D yard (three.js via React Three Fiber) at `/`, the 2D pixel yard (Phaser) at `/?view=2d`, React and Framer Motion for the cards. It only draws what the engine sends. |
| `shared/` | The event contract (`events.ts`) and the state reducer both sides use. |
| `mock/` | A fake engine on port 4000 for game development, and the recordings in `mock/recordings/`. |
| `demo-kit/` | Generates the fake demo world on the laptop. |
| `landing/` | The public landing page. |
| `scripts/` | `demo.sh`. |
