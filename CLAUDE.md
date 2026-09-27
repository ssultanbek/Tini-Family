## Which role are you?

Two Claude Code sessions build this repo: the engine builder (Sultan) and the game builder
(teammate, starts inside game/). If your working directory is game/ or you were told you're
the game builder, follow game/CLAUDE.md only; read everything below for context but never
edit outside game/. Otherwise you're the engine builder and everything below applies.

# Tini Family (ShellHacks 2026)

A safety crew for AI coding agents: "your agent gets the keys to the room, not the house."
Tini (husband) reads each prompt and builds a fence around only what Claude Code needs, then enforces it
on every action. Tina (wife, allergic to red) inspects folders before they come in and inspects the work
after every turn; nothing leaves until every fence segment is green. The dog is Claude Code, building
inside the yard. It's a local desktop app: an engine on the laptop plus a 2D game screen in the browser.

**Goal:** 1st place Best Overall. **Deadline:** Devpost submitted by **Sunday Sept 27, 10:00 AM ET**.
Feature freeze **3:00 AM Sunday** (revised Sat 6:30 PM; see the schedule in docs/MASTER_PLAN.md).

## Read before doing anything

1. `docs/MASTER_PLAN.md`: the source of truth. Stages, decisions, done-when tests.
2. `docs/VERIFIED_FACTS.md`: SDK/API details already checked against current docs. Don't guess APIs.
3. `docs/STATUS.md`: where we are. Update it at the end of every stage.
4. `docs/PRODUCT_CONTEXT.md`: product, story and pitch background. The master plan wins on conflicts.

## Who does what

- **Sultan:** owner; runs you on his Mac (the only machine with API keys and demo files).
- **You (Claude Code):** build `shared/`, `mock/`, `engine/`, the demo kit and scripts, one stage at a time.
- **Claude (claude.ai):** manager. Writes your stage prompts and reviews your reports (Sultan relays them).
- **Teammate:** builds `game/` with Codex. **Never edit anything in `game/`.**

| Folder | Owner | Notes |
|---|---|---|
| `shared/` | you | The event contract. After Checkpoint A: additive changes only. Every change goes in your report so the teammate is told. |
| `mock/` | you | Fake engine on :4000 for the teammate. Keep it in sync with contract changes. |
| `engine/` | you | Real engine. |
| `game/` | teammate | Read-only for you. |
| `landing/` | teammate | Public landing page. Never edit. |
| `docs/` | you + manager | Keep STATUS.md current. |

## How we work

1. Do **only the stage you were given**. Don't start the next one.
2. Before coding, write a short plan (5 to 10 lines).
3. Build in small pieces. Run the stage's **done-when tests for real** and paste the real output.
4. Commit each working piece with a clear message and push. Never commit secrets.
5. Update `docs/STATUS.md` (stage status, decisions log, open issues).
6. End with the report below, then stop and wait.

**Stop and report instead of guessing** if:
- a plan decision looks wrong,
- an API doesn't match VERIFIED_FACTS,
- or you're blocked for more than 20 minutes.

Give options with your recommendation. Never change the plan silently.

## Hard rules

- **Enforcement never depends on AI.** The fence checker, sandbox, staging, access check and fixes are plain code.
- **Every AI call goes through the AI ladder** (`engine/src/ai.ts`, Stage 1): cache → Gemini → Claude Haiku → hard-coded fallback. It never throws.
- **One `emit()` path.** Every engine event goes through the project's `emit()`: numbered, reduced, recorded, broadcast.
- **Ports and binding:**
  - The engine binds **127.0.0.1:4000** only. Game dev server is :5173; launched sites are :5050.
  - Don't run the mock and the engine on :4000 at the same time.
- **Secrets:**
  - Keys live in `engine/.env` (gitignored): `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, optional `GEMINI_MODEL`.
  - Never print key values.
  - Demo-kit fake secrets are assembled at runtime, never committed (GitHub push protection).
- **Costs:** the dog uses Sonnet with per-turn `maxBudgetUsd` and `maxTurns` caps.
- **No CDNs.** The demo must work with Wi-Fi off.
- **TypeScript on Node,** run with `tsx`. Typecheck against the installed SDK types (`npm run typecheck`).

## Report format (end every stage with this)

```
STAGE <n> REPORT
Done: <what now works, 3-6 lines>
Tests: <each done-when test → PASS/FAIL with the key output lines>
Commits: <hashes + messages>
Contract changes: <none | list, with "teammate must know">
Deviations from plan: <none | what + why>
Risks / blockers: <none | list>
Cost so far: <API spend if known>
Waiting for next instructions.
```
