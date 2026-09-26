# Requests from the game to the engine

Write one line per missing event or field. Sultan adds it to shared/events.ts.

- mock: after turn 2+ the engine sends `launch.unlocked` but has no `launch` gate, so a Launch click gets no answer (the game drops the pending click on the next `turn.started`). Should later turns be launchable, and should a new `report.ready` replace the old report?
- mock: `stop` (v1.2) has no handling in the mock, so the Stop button only shows "Stopping…" until the turn ends by itself. Could the mock end the running turn with `turn.finished { summary: "Stopped by you" }` like the engine?
