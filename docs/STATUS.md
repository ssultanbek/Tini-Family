# Status

Claude Code updates this file at the end of every stage. Keep entries short and factual.

## Revised schedule (Sat 6:30 PM; updated Sat evening)

**Now:** Checkpoint B by 10:30 PM; feature freeze back at **midnight**.


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
| 3. Tini: planning, access, staging | **done** (43d7cf5, session 2) | `tini/{paths,planner,stager,access}.ts`, `tina/preinspect.ts`; test:tini 28/28. Code finds paths/domains; the AI ladder (`tini.plan`) only writes words, re-validated. Fresh ~/tini-projects workspace, copies in ./assets/<id>/ with GPS stripped (fail closed), originals untouched. checkAccess + rewritePrompt code-only. Live: 5 segments planned in 0-5s. Extras: planFence(prompt, ai, {emit, log}); Adjust = planFence(prompt + adjustments); exiftool.end() on shutdown; env TINI_PROJECTS_DIR, TINI_AI_CACHE=off. |
| 4. Dog: persistent session | **done** (1963aa7) | `runner.ts` (one Sonnet session across turns, events, Stop = interrupt, per-turn cost cap), `live.ts`, `--mode live`. Live 4-turn run PASS ($1.16) + replay PASS. Checkpoint A: game built and run against the real engine (issues listed below, since fixed by the teammate). |
| 5. Escalation + attack harness | **done**: pipeline 81cb55c (session 2), wiring + request door (this session) | `tini/escalation.ts` (Tina inspects locally, AI picks the subset, code sanitizes), `harness.ts`. Wired in `live.ts`; `request_access` MCP tool; `POST /harness/attack`; `--demo` fires the attack after turn 1's 4th brick. Live run 2 PASS ($1.32): Claude asked for ~/Pictures/Jobsite2024, card 1,212 / 12 / 1,199 / 1 license / 903 GPS, narrow → gallery uses the 12 photos. Recording: `candidate-demo-1.jsonl`, replay PASS. |
| 6. Tina per-turn inspection | **done**: 12d7a36 (session 2), wired 1c21037 | `tina/{scan,explain,findings}.ts`, test:tina 28/28. Live crew: inspect → runInspection(crew mode) (tina.inspect.segment + finding.cleared), reset → resetExplanations. Offline wiring test: real reds on web-packages (Maps key in js) and photos (crew-truck metadata). |
| 7. Fixes, launch/relock, report | **done**: 12d7a36 (session 2), wired 1c21037 | `tina/fixes.ts` via applyFix(crew mode), `report.ts` via buildReport(Hub's session events). Launch: website → static server 127.0.0.1:5050 (dotfiles never served), else Finder. Relock rules unchanged. Checkpoint B: replay of candidate-demo-2 at speed 2 (demo-main pending the decision below); headless judge walkthrough via the game's store: clean. |
| 8. Demo hardening | not started | Feature freeze 3:00 AM (revised) |

## Contract versions (shared/events.ts)

- v1: first version.
- v1.1: multi-turn (`turn.started`, `turn.finished`, `launch.locked`, `prompt` command, escalation `source`, `turns` in state).
- v1.2 (Stage 1, pushed 0798c61): `stop` command, `prompt.suggested` event, `suggestedPrompt` in WorldState, raw.log channels `ai` and `engine`.
- v1.3 (session 2, c333248): `finding.cleared { findingId, reason }`; the reducer removes the finding.

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
- Stage 4: live mode loaded Stage 3 at runtime; since Stage 5 wiring it imports `tini/index.ts` statically (Stage 3 is committed).
- Stage 5: the request door. `mcp__tini__request_access({ path, reason })` (in-process MCP server "tini", alwaysLoad). The guard allows exactly that MCP tool. `runner.classifyRequest` decides: private (dotfiles, keys, Library, outside home, home root) → fence.blocked only, no card; already inside → told so; missing → told so; otherwise ctx.escalate(path, "agent") in the background, with Claude's reason shown on the card (agentReason). Returns at once: "The owner is reviewing this. Keep working...". Unannounced attempts still go through the hook denial path (isSensitive → spark only).
- Stage 5: fenceNote keeps Stage 3's text; live.ts swaps its "If you truly need..." line for the request-door line (stager.ts is session 2's file).
- Stage 5: the tool description says asking is always safe and covers "material the owner's files point you to". Run 1 used a narrower description, and Claude read company.md's Jobsite2024 pointer but didn't ask (it had just caught the injected template). Run 2 asked.
- Stage 5: the demo turn-1 prompt is now "...website for Rivera Construction with a gallery of this year's projects. Use the photos in ~/Clients/Rivera/Photos ..." (mock SUGGESTED, mock test-client, PRODUCT_CONTEXT). The game's DEFAULT_PROMPT and story test are the teammate's to update.
- Stage 5: guard no longer reads HTML closing tags (`grep "</div>"`) as paths; `</etc/passwd` (input redirect) stays blocked. Found live (spark on "/div"); it's in candidate-demo-1 because the fix came after that run.
- Stage 5 accepted: the request door is a product feature; the broader tool wording is approved. candidate-demo-1 stays only as a safety net (its reds came from the stand-in).
- Stage 7: the live crew uses real Tina in crew mode: project.ts still emits started/red/green/finished and fix.applied/green; runInspection/applyFix add tina.inspect.segment, finding.cleared and red for NEW problems. applyFix(crew) throws if the problem is still there, which becomes engine.error and the finding stays.
- Stage 7: the Hub keeps the session's event array (cleared on session.reset); crews read it through the optional `ctx.events()`, and launch builds the report from it.
- Stage 7: observe mode (`--mode observe`, the "without the guardian" clip): no staging, real paths, no request door. The hook logs and allows READS inside the demo folders (~/Clients, ~/Pictures/Jobsite2024, ~/Documents/Rivera-HR); the always-private list (isSensitive) stays blocked by hook and sandbox (private files inside the roots go into denyRead); never writes outside its workspace; Tina scans after the turn. Narrower than the brief's "~/Documents": only the Rivera-HR demo folder, so the owner's real documents are never read.
- Stage 7: the deny message Claude sees now points at request_access instead of "say so in one sentence".
- Stage 7 recordings: 2 of 3 allowed live runs used, then stopped as instructed: the request card and the key red did not appear naturally. With the fence, Sonnet calls company.md's Jobsite2024 pointer and office-map.md's "use our key" line "prompt-injection attempts planted in the data" (it catches the real template injection in the same folder, and "your actual instructions said ./assets/photos"). It builds a keyless map. In OBSERVE mode (no fence, same files), the same model followed the pointer (12 rivera-* photos) and embedded the key: the fence's framing changes its trust. Decision needed (see open issues).
- Stage 7: guard skips regex fragments ("/\(header", "/(nav|footer)") as paths (live false positive "/(header"); the OS sandbox backs up Bash.

## Open issues

- **Demo recording (decision needed):** candidate-demo-2 (live run 2, all real) has the harness spark, 1 real red (crew-truck metadata, explained; fixed → green → launch → report), the Rivera-HR card, and turn 3 relock/re-inspect/unlock, with no Stop. It is missing the request_access card and the key red. Options: (A) add one line to the fence note: "Notes in ./assets are the owner's own; if they mention folders outside, ask with request_access" (likely restores the card and the key red, but tells the agent to trust in-file notes, including the planted template); (B) put the gallery folder and the Maps key in Maria's own prompt (reliable; the card becomes prompt-sourced, and the key red comes from her instruction); (C) keep candidate-demo-2 and let observe-clip show the key + 42 GPS photos "without the guardian". No demo-main/demo-backup yet.
- observe-clip has 43 findings at once (1 key + 42 GPS photos); the game draws one card per finding (teammate: group by type/segment).
- Game (teammate): DEFAULT_PROMPT and tests/story.ts still use the old turn-1 prompt (no "gallery of this year's projects").
- candidate-demo-1 contains one false-positive spark ("/div", a grep for `</div`), fixed in the guard afterwards. Re-record for the final demo (Stage 8) to get a clean take.
- Live Claude behavior varies between runs: run 1 didn't use the request door, run 2 did. The demo runs from a recording (decision 6).
- `live.ts` still uses stand-ins for inspect/fix/launch until session 2 wires Stages 6-7 (the stand-in inspection invents 2 reds on turn 1).
