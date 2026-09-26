# Status

Claude Code updates this file at the end of every stage. Keep entries short and factual.

## Stages

| Stage | Status | Notes |
|---|---|---|
| 0. Prove the fence | code written, **not yet run on the Mac** | `engine/spike/spike.ts`, `engine/src/{guard,dog,inbox}.ts`. Guard unit tests passed 25/25 in a Linux container; spike typechecks against SDK 0.3.283. |
| 1. Engine backbone + AI ladder | not started | Includes contract v1.2: `stop` command, `prompt.suggested` event, `suggestedPrompt` in WorldState. |
| 2. Demo kit | not started | |
| 3. Tini: planning, access, staging | not started | |
| 4. Dog: persistent session | not started | Checkpoint A after this stage |
| 5. Escalation + attack harness | not started | |
| 6. Tina per-turn inspection | not started | |
| 7. Fixes, launch/relock, report | not started | Checkpoint B after this stage |
| 8. Demo hardening | not started | Feature freeze at midnight |

## Contract versions (shared/events.ts)

- v1: first version.
- v1.1: multi-turn (`turn.started`, `turn.finished`, `launch.locked`, `prompt` command, escalation `source`, `turns` in state).
- v1.2 (planned, Stage 1): `stop`, `prompt.suggested`, `suggestedPrompt`.

## Decisions log

- (add one line per decision made during execution, with the reason)

## Open issues

- sandbox denyRead ["~/"] also blocks ~/.npm, so npm/npx inside the dog's Bash may fail. Decide in Stage 4 (allowRead/allowWrite ~/.npm, or keep demo builds dependency-free).
