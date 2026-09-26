# Status

Claude Code updates this file at the end of every stage. Keep entries short and factual.

## Revised schedule (Sat 6:30 PM)

Stage 1 by 8:30 PM | Stage 2 in parallel (second session) | Checkpoint A by 10:30 PM | Checkpoint B by 2:00 AM |
feature freeze 3:00 AM | demo hardening 3-5 AM | sleep 5-7:30 AM | submit by 10 AM.

**CUT (pitch-only or fallback):** existing-folder mode, resume after restart, web-address escalations,
Gemini vision (metadata fallback keeps Photos red), incremental scanning.

## Stages

| Stage | Status | Notes |
|---|---|---|
| 0. Prove the fence | **done** (Sept 26) | Spike 5/5 PASS on the Mac (total $0.13). Guard tests 25/25, typecheck clean. Check 3 blocked by Seatbelt ("Operation not permitted"); check 5 = one session_id across 2 results. |
| 1. Engine backbone + AI ladder | **done** (Sept 26) | Contract v1.2 pushed. `engine/src/{project,crew,standins,recorder,replay,server,main,ai}.ts`. Loop test PASS (narrow/all/deny + replay), ai.stress 100/100, ai:smoke real sources, edge tests, typecheck clean. |
| 2. Demo kit | not started | |
| 3. Tini: planning, access, staging | not started | |
| 4. Dog: persistent session | not started | Checkpoint A after this stage |
| 5. Escalation + attack harness | not started | |
| 6. Tina per-turn inspection | not started | |
| 7. Fixes, launch/relock, report | not started | Checkpoint B after this stage |
| 8. Demo hardening | not started | Feature freeze 3:00 AM (revised) |

## Contract versions (shared/events.ts)

- v1: first version.
- v1.1: multi-turn (`turn.started`, `turn.finished`, `launch.locked`, `prompt` command, escalation `source`, `turns` in state).
- v1.2 (Stage 1, pushed 0798c61): `stop` command, `prompt.suggested` event, `suggestedPrompt` in WorldState, raw.log channels `ai` and `engine`.

## Decisions log

- Stage 0: sandbox layer kept (check 3 passed, so the fallback isn't needed). Node is `/opt/homebrew/bin/node`, not under `~`, so no `allowRead` addition in `dog.ts`.
- Stage 0: the 400 workspace error did not return (workspace-scoped key, no header).
- Stage 1: raw.log gained channels `ai` (ladder log lines) and `engine` (ignored commands). Additive, part of v1.2.
- Stage 1: after inspection the phase goes to `ready` even with reds (Part 2); launch unlocks only when all green. The mock keeps `inspecting` until fixes; the game handles both.
- Stage 1: Stop during turn-1 setup (planning/contract/fencing) resets to idle; Stop in building or a later turn's planning ends the turn as "Stopped by you" and Tina inspects. An escalation open at Stop closes as deny ("Turn stopped, nothing added").
- Stage 1: agent escalations deliver approved files as a follow-up message after Claude's current result (Crew.runTurn with followUp=true); denied agent requests send no follow-up. Prompt escalations append the note to Maria's held prompt.
- Stage 1: recordings start a new file per Reset and are only written once the session has a command. Replay drops the recorded `engine` raw.log lines (they were the live run's stray clicks).
- Stage 1: Gemini gets no `httpOptions.timeout` (server rejects deadlines under 10s); the 8s timeout is client-side.

## Open issues

- Findings that a later rescan no longer finds have no "resolved" event in the contract (only `fix.applied` clears them). Stage 6 must decide: emit `fix.applied` with a system fixId, or add an event (contract change).
- The game's RawView channel chips list only hook/config/sdk/scan; `ai` and `engine` lines still show but can't be filtered (teammate).
- Spike's `osSandboxHit` regex also matches the word "sandbox" in prompts/replies, so it reads true on checks 1-2 where the hook denied first. Cosmetic; Stage 4 event mapping should match "Operation not permitted" only.
- SDK prints "claude.ai connectors are disabled because ANTHROPIC_API_KEY ... is set" on stderr every session. Harmless; filter it from the stderr log in Stage 4.

- sandbox denyRead ["~/"] also blocks ~/.npm, so npm/npx inside the dog's Bash may fail. Decide in Stage 4 (allowRead/allowWrite ~/.npm, or keep demo builds dependency-free).
