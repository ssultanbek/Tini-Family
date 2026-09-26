# Status

Claude Code updates this file at the end of every stage. Keep entries short and factual.

## Stages

| Stage | Status | Notes |
|---|---|---|
| 0. Prove the fence | **done** (Sept 26) | Spike 5/5 PASS on the Mac (total $0.13). Guard tests 25/25, typecheck clean. Check 3 blocked by Seatbelt ("Operation not permitted"); check 5 = one session_id across 2 results. |
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

- Stage 0: sandbox layer kept (check 3 passed, so the fallback isn't needed). Node is `/opt/homebrew/bin/node`, not under `~`, so no `allowRead` addition in `dog.ts`.
- Stage 0: the 400 workspace error did not return (workspace-scoped key, no header).

## Open issues

- Spike's `osSandboxHit` regex also matches the word "sandbox" in prompts/replies, so it reads true on checks 1-2 where the hook denied first. Cosmetic; Stage 4 event mapping should match "Operation not permitted" only.
- SDK prints "claude.ai connectors are disabled because ANTHROPIC_API_KEY ... is set" on stderr every session. Harmless; filter it from the stderr log in Stage 4.

- sandbox denyRead ["~/"] also blocks ~/.npm, so npm/npx inside the dog's Bash may fail. Decide in Stage 4 (allowRead/allowWrite ~/.npm, or keep demo builds dependency-free).
