# Tini Family: game front end (read this fully before writing code)

You are helping build the **game UI** for Tini Family, a ShellHacks 2026 project.
The person you are working with is not an engineer. Keep him moving: make small
working steps, run them, and commit when something works. Explain in one or two
plain sentences, not lectures.

## What the game is

A 2D top-down yard. **Tini** (husband) builds a fence around only what the AI
agent needs. **Tina** (wife) inspects everything and is "allergic to red": every
problem shows as a red fence segment until fixed, then turns green. **The dog**
is the AI coding agent, building a house (the website) inside the yard. Our own
original dog: never use Anthropic's logo or mascot art.

A real engine (built by Sultan) decides everything and sends events. **The game
only shows events and sends clicks back.**

## This is a workspace people keep using, not a one-shot website builder

Maria opens a project and keeps prompting, many times: "build the site", then
"add a careers page", "make the header darker", "use the files in ~/Documents/HR".
And the task can be anything done with Claude Code (a website, a script, a data
analysis, fixing code), not only websites. So:

- **The prompt bar is always on screen** (bottom of the page). When `phase` is
  `idle` it sends `start` (first prompt, creates the project). When `phase` is
  `ready` or `launched` it sends `prompt`. In every other phase it's disabled and
  shows "Tini is working...".
- **Show the turn history** from `state.turns` (each prompt with Claude's summary).
- **The house is "the project"** and keeps growing across turns (`bricks` is a running total).
- **Launch can lock again.** A new turn sends `launch.locked` until Tina re-inspects.
- **Never hard-code website words** in the UI. Every label (segments, cards,
  findings, report) comes from events.

## Hard rules (never break these)

1. **Only edit files inside `/game`.** Never edit `/shared`, `/mock`, `/engine`.
   If you need something from them, stop and write it in `/game/REQUESTS.md`.
2. **The engine decides what and why. The game decides how it looks.**
3. **Never invent logic.** No timers that "finish" a step, no fake findings, no
   deciding what is safe. If an event isn't in `/shared/events.ts`, it doesn't
   exist. Need a new behavior? Add a line to `/game/REQUESTS.md`.
4. **The game only sends these commands** (types in `GameCommand`): `start`,
   `approve.plan`, `adjust.plan`, `escalation.choose`, `fix.apply`, `launch`, `reset`.
5. **Events never contain pixel positions.** They contain segment ids and zones
   (`gate`, `yard`, `house`, `outside`). The game owns all layout in one file,
   `src/layout.ts`.
6. **Animate in order, one at a time per character.** Keep a queue per actor
   (`tini`, `tina`, `dog`). `system` events apply immediately.
7. **On connect, the engine sends a `snapshot` (WorldState).** Draw it instantly
   with no animation. This is how a page refresh mid-demo recovers. Test it.
8. **Never import from `/engine` or `/mock`.** Only from `../shared/events.ts`
   and `../shared/reducer.ts` (both are safe to import, never to edit).
9. **3D is not allowed.** Top-down 2D only.

## Protocol (the whole API)

```ts
import { io } from "socket.io-client";
import { SOCKET, ENGINE_PORT, type EngineEvent, type GameCommand, type WorldState } from "../shared/events";
import { reduce } from "../shared/reducer";

const socket = io(`http://localhost:${ENGINE_PORT}`);          // port 4000
socket.on(SOCKET.snapshot, (s: WorldState) => { /* replace store, draw instantly */ });
socket.on(SOCKET.event, (e: EngineEvent) => { /* store = reduce(store, e); enqueue for animation */ });
socket.emit(SOCKET.command, { type: "approve.plan" } satisfies GameCommand);
```

Ignore any event whose `seq` is not greater than the last one you applied.
Use `reduce()` for state; don't write your own state logic.

`/mock/test-client.ts` is a working example of a client that clicks through
the whole story. Read it before building the network layer.

## Stack

- Vite + TypeScript. **Phaser 3** for the yard. **React + Framer Motion** as an
  overlay for cards, buttons, speech bubbles and the raw view.
- `socket.io-client` for the connection.
- In `vite.config.ts` set `server: { port: 5173, fs: { allow: [".."] } }` so
  `../shared` imports work.
- **No CDNs.** No Google Fonts links, no libraries or images loaded from the
  internet. Everything must be installed with npm or saved in `public/`, because
  the demo must work with the Wi-Fi off.
- Art: **Kenney.nl free packs only (CC0)**: "Tiny Town" for grass, paths,
  fences and houses; "Tiny Dungeon" for Tini and Tina; an animal from Kenney
  for the dog. Put them in `game/public/assets/`. Pick, never draw.

## Screens and what drives them

| Thing on screen | Driven by |
|---|---|
| Empty yard, dog sleeping, prompt bar | `phase: "idle"`, send `start` with the prompt text |
| A new turn begins / ends (turn history) | `turn.started`, `turn.finished` (summary) |
| Later prompts | prompt bar in `ready`/`launched`, send `prompt` with the text |
| Tini thinking, Tina pre-inspecting | `speech`, `tina.inspect.started` |
| **Contract card** (Approve / Adjust) | `fence.plan.proposed` (`contract`), phase `contract` |
| Fence segments appearing with labels | `fence.segment.built` (label + detail painted on the segment) |
| Tini carrying a box from gate into yard | `tini.carry.box` |
| House growing | `dog.brick.placed` (`bricks` = total; each event adds one brick) |
| Dog bumps the fence, sparks, reason toast | `fence.blocked` (show "simulated attack" tag when `simulated` is true) |
| **Escalation card** (3 buttons, recommended one highlighted) | `escalation.opened`; closes on `escalation.resolved`. Header depends on `source`: `agent` = "Claude is asking for more", `prompt` = "Your request needs something outside the fence". The dog keeps working while it's open. |
| Tina walking the fence | `tina.inspect.segment` |
| Red segment + **finding card** with fix buttons | `segment.red` (`finding.fixes` are the buttons) |
| Segment turns green | `segment.green` |
| **Launch button** (disabled until unlocked) | `launch.unlocked`, send `launch`; `launch.locked` disables it again and shows its `reason` |
| **Access report** | `report.ready` |
| **Raw view toggle** (for engineer judges) | `raw.log` lines + the raw JSON of every event |

Segment colors: `planned` = grey dashed, `built` = wood, `inspecting` = yellow
pulse, `red` = red with a gentle shake, `green` = green.

## Build order (each milestone must work before the next)

1. **M1, the dashboard (first 2 hours).** No Phaser yet. A plain page that
   connects, shows the phase, the segment list with status colors, every event
   in a scrolling log, and every button/card from the table above wired to real
   commands. This is also our emergency fallback UI, so keep it working forever
   at `/?view=dashboard`.
2. **M2, the yard.** Phaser scene: grass, gate, house zone, fence segments
   placed around the yard from `layout.ts`, statuses as colors. House grows with
   bricks.
3. **M3, the family.** Tini, Tina and the dog walk between zones, per-actor
   queues, speech bubbles, sparks on `fence.blocked`, Tini's box carry.
4. **M4, polish.** Card animations, report screen, raw-view toggle, sounds if
   time allows.

**Feature freeze: Saturday midnight.** After that only bug fixes.

## Running it

```bash
# terminal 1: fake engine (same port and protocol as the real one)
cd mock && npm install && npm run mock                  # add -- --speed 3 to go faster
# replay a recorded run instead of the script:
npm run mock -- --recording recordings/sample-mock-run.jsonl

# terminal 2: the game
cd game && npm install && npm run dev                  # http://localhost:5173
```

To restart the story, send `{ type: "reset" }` (add a small Reset button in the corner).
The fake engine keeps accepting prompts after the first story ends. A prompt that
contains a folder like `~/Documents/Rivera-HR` makes Tini ask first (escalation
card with `source: "prompt"`); any other prompt goes straight to the dog.

## Git (do this every time)

```bash
git pull                        # before starting any work
git add game && git commit -m "game: <what works now>" && git push   # every time something works
```

Never `git add` anything outside `game/`. Never force-push. If `git pull` shows a
conflict outside `game/`, stop and call Sultan.


Also read and follow @AGENTS.md in this folder (locked technical decisions).
