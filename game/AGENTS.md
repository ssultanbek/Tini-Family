# Tini Family game: rules for Codex (loaded every thread)

## Read first, every new thread
1. `CLAUDE.md` in this folder. It is THE spec for the game. It was written for another
   agent, but every rule in it applies to you. Where it says "Claude", read "you".
2. `../shared/events.ts` (the event contract) and `../shared/reducer.ts` (state).
3. `../mock/test-client.ts` (working reference client), `../mock/scenario.ts` (the story
   the fake engine plays), `../mock/player.ts` (how gates wait for clicks).
You may READ anything in the repo. You may WRITE only inside this `game/` folder.

## Who you work with
Altair is not an engineer. He is a teammate at a 36-hour hackathon (ShellHacks 2026),
deadline Sunday 10 AM, feature freeze Saturday midnight.
- Make technical decisions yourself. Never ask him a technical question.
- Only ask him for things only he can do: download art, run something in his Terminal,
  look at the browser and tell you what he sees, send a screenshot, commit and push.
- When you need him to act, give exact steps: which app, what to type, what to click.
- After each chunk of work: 3 lines max on what changed, then exactly how to test it.

## Hard rules (from CLAUDE.md, restated because they matter most)
- Never edit `../shared`, `../mock`, `../engine`, or any root file. Missing event or
  field? Add one line to `REQUESTS.md` and tell Altair to send it to Sultan.
- The engine decides everything. The game only draws events and sends clicks.
  No timers that finish steps, no fake findings, no invented events, no safety logic.
- Commands the game may send: `start`, `approve.plan`, `adjust.plan`,
  `escalation.choose`, `fix.apply`, `launch`, `reset`. Nothing else.
- Events carry segment ids and zones, never pixels. All positions live in `src/layout.ts`.
- Top-down 2D only. No Anthropic logos or mascot art. Kenney CC0 art only.
- After each finished step (build passes + story run works): git pull, then
  git add game/ only, commit with message 'game: <what works now>', and git push.
  Never add files outside game/, never force-push, never reset or rebase. If pull shows
  a conflict outside game/, stop and tell Altair to call Sultan.

## Locked technical decisions
- Stack: Vite + TypeScript + React + Framer Motion + socket.io-client + **Phaser 3**.
  Install Phaser as `phaser@3`. Plain `npm install phaser` now gives Phaser 4,
  which has a different API. Do not add other libraries without a clear reason.
- Scaffold by writing files directly (package.json, index.html, vite.config.ts,
  tsconfig.json). Never run interactive generators like `npm create vite`.
- `vite.config.ts`: `server: { port: 5173, fs: { allow: [".."] } }`.
- `tsconfig.json`: `"allowImportingTsExtensions": true`, `"noEmit": true`,
  and include `../shared` (the shared files import with `.ts` extensions).
- Layout of `src/`:
  - `net.ts`: the only file that touches the socket.
  - `store.ts`: holds WorldState, updated only through `reduce()` from `../shared/reducer.ts`.
  - `queue.ts`: per-actor animation queues (`tini`, `tina`, `dog`).
  - `layout.ts`: every position and size on screen.
  - `scene/`: Phaser scenes.
  - `ui/`: React overlay (cards, buttons, bubbles, raw view, report, dashboard).
- Two views in one app: the game at `/`, the dashboard at `/?view=dashboard`.
  The dashboard must keep working until the end. It is the emergency fallback.

## Networking rules (copy the logic of ../mock/test-client.ts)
- On `snapshot`: replace the store, set lastSeq = snapshot.seq, clear all animation
  queues, redraw everything instantly with no animation.
- On `event`: always accept `session.reset` (then clear queues and redraw).
  Otherwise ignore any event with `seq <= lastSeq`.
  Apply `reduce()` immediately, then enqueue the event for animation.
- State drives the UI; animation only decorates it. Cards and buttons (contract,
  escalation, findings, launch, report) render from the store, never wait for an
  animation to finish. A click must never be blocked by a queue.
- `system` events apply immediately, never queued.

## Animation speed rule
The demo runs the fake engine at `--speed 3` to `--speed 5`. Animations must keep up.
If an actor's queue has more than 2 items waiting, shorten durations; if more than 5,
skip to the end state. The game must never lag more than ~2 seconds behind the engine.

## Known behaviour of the fake engine (don't "fix" these)
- `adjust.plan` has no gate in the mock: send it, but show no fake result.
- The escalation card opens while the dog keeps working. That's intentional.
- The `deny` escalation choice adds no new segment. `narrow` and `all` add `jobsite-photos`.
- Two findings arrive; each needs one `fix.apply` click.

## Definition of done for any change
1. `npm run build` passes (typecheck + bundle) with zero errors.
2. It works against the fake engine: `cd ../mock && npm run mock -- --speed 3`.
3. Refreshing the browser mid-story redraws the current state correctly.
4. The dashboard at `/?view=dashboard` still works.
Say "done" only after all four. If you could not check one, say which.

## Readability (judged at a table, on a laptop screen)
Big text (min 18px on cards), high contrast, pixel art scaled 3-4x with `pixelArt: true`.
Red and green segments also get an icon or label, never color alone.
