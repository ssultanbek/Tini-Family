# Tini Family yard (Milestone 2)

## Run

Terminal 1:

```sh
cd /Users/altairibysh08/Tini-Family-master/mock
npm run mock -- --speed 3
```

Terminal 2:

```sh
cd /Users/altairibysh08/Tini-Family-master/game
npm install
npm run dev
```

Open http://localhost:5173 for the Phaser 3 yard with shared React controls.
The emergency M1 dashboard stays at http://localhost:5173/?view=dashboard and
does not initialize Phaser. Phaser is pinned to major 3 with pixelArt enabled.

## Click-through check

1. Confirm Connected, sleeping dog, zero bricks, disabled Launch. Click Start.
2. The contract lists allowed and stripped data. Optionally type an adjustment and
   click Adjust (the mock deliberately does not respond), then click Approve.
3. Watch fence segments build, bricks increase, and blocked notifications appear.
   Dismiss a notification with its × button; it remains in Blocked attempts.
4. At the access request, check all inspection counts and the recommendation.
   Refresh the page **before choosing**. The same open request, segments, bricks,
   and blocked history should return from the engine snapshot. Choose an option.
5. Click one fix on each of the two finding cards. Wait for all segments to turn
   green and Launch to unlock, then click Launch. Inspect all five report sections.
6. Open `/?view=dashboard`: the completed world/report should restore. Toggle Raw
   view to see raw log lines; new events also show their full JSON. Click Reset.

Repeat with Allow whole folder and Deny if checking every branch. Deny keeps five
segments; the other options add Job-site photos. All actions wait for engine facts.

## Checks

```sh
npm run build
npm test
# Needs the running fake engine; resets its shared session and auto-clicks it:
npm run test:story -- narrow
npm run test:story -- all
npm run test:story -- deny
```

The live story check uses the production network/store modules, sends real commands,
creates a fresh connection/store at escalation to exercise snapshot recovery, and
exits within 55 seconds. It starts no servers. Do not click through the dashboard at
the same time as this check, since every client shares the mock session.

## Boundaries

- `src/net.ts` is the sole Socket.IO boundary; it never buffers offline clicks.
- `src/store.ts` uses only the shared reducer for world updates. UI-only speech,
  connection status, pending clicks, and received event history are kept separately.
- `src/queue.ts` provides independent, cancellable actor queues. Without a scene
  attached, events are consumed immediately. A scene must honor abort signals and
  the `normal` / `fast` / `instant` speed hint when rendering decoration.
- `src/layout.ts` owns yard positions and sizes, including seven segment slots.
- `src/ui/` renders shared cards/buttons immediately from state.
- `src/scene/YardScene.ts` draws segment array order and the engine brick count.
  Inspecting pulses and red shakes are visual only. Snapshot/reset cancels all
  tweens and redraws statically. Status changes destroy obsolete decoration.
- House roof pieces grow from 0 to 12; the exact engine count is always shown.
  The mock finishes at 10, so no extra completion pieces are invented.

The snapshot protocol includes world state, blocked history, and the last 200 raw
log lines. It does **not** include past event JSON, past speech, or the launch URL.
After reconnect, the event log therefore starts fresh and crew speech waits for new
events. Historical event JSON is never invented. No protocol changes are required.

Only game files were edited. This supplied folder currently has no Git metadata;
commit from your actual Git checkout once these files are there.

## Art

No art pack was present. The yard currently uses simple colored shapes. Download
**Kenney Tiny Town** (CC0) from https://kenney.nl/assets/tiny-town and extract the
pack contents into `/Users/altairibysh08/Tini-Family-master/game/public/assets/tiny-town/`.
Keep the tile folders and supplied license. See `public/assets/README.md`; tile
mapping is a follow-up once the files exist, not an automatic asset switch.

## M2 verification — September 26, 2026

- Production typecheck and build passed; Vite reports the Phaser chunk size warning.
- All four store/reconnect tests passed.
- Browser click-through against the existing mock confirmed at `--speed 3`: reset,
  start, planned fence, approval, built fence, growing house, narrow escalation,
  two red findings, both fixes, all green, launch and access report.
- Browser reload during escalation restored five built segments, seven bricks,
  and the open request immediately. Reset cleared the earlier completed yard.
- Dashboard restored the report and showed incoming events and raw JSON.
- Live production transport checks passed for deny (five segments) and all
  (six segments), including fresh connections during escalation.
- The mock uses at most six segments and ten bricks; seven slots and twelve roof
  positions are reserved in layout.ts. No mock/engine/shared files were changed.
