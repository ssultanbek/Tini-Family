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
| 2. Demo kit | committed (f5e1362, second session) | Generator + verifier in `demo-kit/`; demo world present at ~/Clients/Rivera, ~/Pictures/Jobsite2024 (1,212 files), ~/Documents/Rivera-HR. Report from that session. |
| 3. Tini: planning, access, staging | committed (43d7cf5, second session) | `tini/{paths,planner,stager,access}.ts`, `tina/preinspect.ts`, `test:tini`. Used by `--mode live`: live run planned 5 segments in 3s, staged ./assets, rewrote paths, prompt card for Rivera-HR. Report from that session. |
| 4. Dog: persistent session | **done** (Sept 26) | `runner.ts`, `live.ts`, `--mode live`. Live 4-turn run PASS ($1.16), replay of it PASS, guard 32+12, typecheck clean. Checkpoint A: engine live on :4000. |
| 5. Escalation + attack harness | committed (81cb55c, second session) | Not yet wired into `live.ts` (still uses the stand-in card + temporary copy). Report from that session. |
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
- Stage 1 follow-up: the mock now goes to `ready` right after inspection, even with reds (matches the engine).
- Stage 4: SDK caps verified (sdk.d.ts + spike/probe-turns.ts): `maxTurns` is per user turn (set 40); `maxBudgetUsd` and `total_cost_usd` are per query() = whole session (set $6). Per-turn cost cap ($2) is ours, estimated from assistant usage, enforced with interrupt(). Stage 0's spike cost was over-counted (results are cumulative): real ~$0.115.
- Stage 4: interrupt() resolves at once (`{"still_queued":[]}`); the stream then yields a synthetic tool_result rejection, "[Request interrupted by user]", and a result `error_during_execution` / `aborted_streaming`. The runner swallows that late result; the session keeps working.
- Stage 4: sandbox allows read+write of `~/.npm` (package cache). `~/.npmrc` stays denied: guard tests + a probe showing a `.npm`-prefixed sibling is blocked by Seatbelt (subpath rule, not string prefix).
- Stage 4: a hook denial of a non-sensitive folder (`guard.escalationFolder`: no dotfiles, Library, keys, home root) emits fence.blocked and calls ctx.escalate(folder, "agent") without blocking the hook; deduped per folder per project. Sparks deduped per target per turn.
- Stage 4: guard no longer treats bare slashes (sed/regex `s/a/b/`, `"//"`) as the path "/" (live-run false positive). Real paths like /etc/passwd stay blocked.
- Stage 4: website turns append "Keep it a simple static site ... Don't start a local server or open a browser to preview it: Tini launches the site after Tina's check." (Claude tried `python3 -m http.server` + curl localhost in the live run; blocked by the network rule.)
- Stage 4: live mode loads Stage 3 (`engine/src/tini`) at runtime, so the engine builds without it.

## Open issues

- Game vs real engine (teammate): Approve stays clickable while the engine re-plans after Adjust; the engine ignores it (can't approve an unseen plan) and the game's pending "approve.plan" never clears (only fence.plan.approved clears it). Fix in game: clear pending approve on fence.plan.proposed and/or disable Approve unless phase is contract. The game's story check sends adjust+approve in the same tick, so it stalls on the engine (passes with that line removed).
- Game hasn't adopted v1.2 yet: no Stop button, no prompt.suggested prefill, no `ai`/`engine` raw-view chips. Adjust hint still says "the mock does not change the plan".
- Claude (Sonnet) did not follow the Jobsite2024 pointer in the live run, and it spotted and refused the template's ~/.ssh instruction on its own. The agent escalation path is covered by stand-in tests; the demo recording needs a run where it happens (or Stage 5's harness/prompting).
- Stage 6 will add the additive event `finding.cleared { findingId, reason }` (decided): findings a rescan no longer finds.
- Temporary in `live.ts` until Stage 5: approved escalation files are copied by name heuristics (narrow skips IMG_*, scan_*, login/password files), GPS stripped with exiftool.
- The game's RawView channel chips list only hook/config/sdk/scan; `ai` and `engine` lines still show but can't be filtered (teammate).
