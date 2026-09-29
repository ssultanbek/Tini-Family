# Tini Family game

The game window for Tini Family. It draws what the engine sends: a 3D yard at `/`, the 2D pixel
yard (Phaser 3) at `/?view=2d`, and a plain dashboard fallback at `/?view=dashboard`. It only
sends clicks; every decision and every fact comes from the engine.

## Run

With the fake engine (no API keys needed), from the repo root:

```sh
cd mock && npm install && npm run mock -- --speed 3
```

In a second terminal:

```sh
cd game && npm install && npm run dev
```

Open http://localhost:5173. The same UI works against the real engine on port 4000, which also
serves the built game (`npm run build`) at http://localhost:4000.

## Click-through check

1. Confirm Connected, sleeping dog, zero bricks, disabled Launch. Send the first request.
2. The contract lists what's allowed and what's removed first. Optionally request an adjustment,
   then Approve.
3. Watch fence segments build, bricks increase, and blocked attempts appear.
4. At an access request, check the inspection counts and the recommended option. Refresh the page
   before choosing: the same open request, segments, bricks and blocked history come back from the
   engine snapshot. Choose an option.
5. Apply one fix on each finding. Wait for every segment to turn green and Launch to unlock, then
   Launch and read the access report.
6. Open `/?view=dashboard`: the completed world and report restore. Toggle the raw view to see raw
   log lines and each event's JSON. Click Reset.

Repeat with "Allow the whole folder" and "Deny" to check every branch.

## Checks

```sh
npm run build
npm test
# Needs the running fake engine; resets its shared session and clicks through it:
npm run test:story -- narrow
npm run test:story -- all
npm run test:story -- deny
```

The story check uses the production network and store modules, sends real commands, opens a
fresh connection during an escalation to exercise snapshot recovery, and exits within about a
minute. It starts no servers. Don't click through the UI at the same time, since every client
shares the mock session.

## Boundaries

- `src/net.ts` is the only Socket.IO boundary; it never buffers offline clicks.
- `src/store.ts` updates the world only through the shared reducer. UI-only state (speech,
  connection status, pending clicks, received event history) is kept separately.
- `src/queue.ts` provides independent, cancellable actor queues. Without a scene attached, events
  are consumed immediately. A scene must honor abort signals and the `normal` / `fast` / `instant`
  speed hint when rendering decoration.
- `src/layout.ts` owns yard positions and sizes, including the segment slots.
- `src/ui/` renders cards and buttons immediately from state.
- `src/scene/YardScene.ts` draws the segments in array order and the engine's brick count.
  Inspecting pulses and red shakes are visual only. A snapshot or reset cancels all tweens and
  redraws statically.

The snapshot includes the world state, blocked history and the last 200 raw log lines. It does
not include past event JSON, past speech or the launch URL, so after a reconnect the event log
starts fresh and crew speech waits for new events.

## Art

See `public/assets/README.md`.
