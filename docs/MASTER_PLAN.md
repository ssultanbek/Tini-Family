# Tini Family: Master Plan v2

ShellHacks 2026 · Goal: 1st place Best Overall · Submit by Sunday 10 AM

*A safety crew for AI coding agents: your agent gets the keys to the room, not the house.*

---

## Revised schedule (Sat 6:30 PM)

| Milestone | Target |
|---|---|
| Stage 1 (engine backbone + AI ladder) | by 8:30 PM |
| Stage 2 (demo kit) | in parallel, second Claude Code session |
| Checkpoint A | by 10:30 PM |
| Checkpoint B | by 2:00 AM |
| Feature freeze | 3:00 AM |
| Demo hardening | 3 to 5 AM |
| Sleep | 5 to 7:30 AM |
| Submit | by 10 AM |

**CUT (pitch-only or fallback):** existing-folder mode, resume after restart, web-address escalations,
Gemini vision (the metadata fallback keeps Photos red), incremental scanning. These are marked **CUT** below.

---

## Who does what (execution model)

| Who | Role |
|---|---|
| **Sultan** | Owner. Runs Claude Code on his Mac (the only machine with the API keys and demo files), relays reports, makes final calls. |
| **Claude Code** (on Sultan's Mac) | Builds everything in `shared/`, `mock/`, `engine/`, the demo kit and scripts, one stage at a time, following this plan. |
| **Claude (claude.ai)** | Technical co-founder and manager. Writes each stage prompt for Claude Code, reviews its reports, decides changes to the plan. |
| **Teammate** | Builds `game/` with Codex (rules in `game/AGENTS.md`, mirrored from `game/CLAUDE.md`). |

---

## Confirmed decisions (Saturday, Sept 26)

- **Multi-turn projects.** Maria keeps prompting in the same project, for any task Claude Code can do, not only websites.
- **CUT (pitch-only):** **Existing-folder mode** matches how Maria will use it: new work gets a fresh folder, work on something she already has gets fenced in place.
- **No prompting while Claude works.** The prompt bar is disabled during a turn, and a Stop button ends the turn.
- **No chat window.** The yard is the interface, the prompt bar gives work orders, and the history is a turn timeline. This keeps us eligible for Microsoft's "What's Missing?" challenge, which bans chat-window products.

---

## Part 1. What shifted from v1

The product shifted a lot; the build plan shifted moderately. No new stages appear, and five stages stay exactly as they were. Five stages change on the inside, because the engine's backbone goes from a straight line to a loop.

| Area | Before (v1) | Now (v2) |
|---|---|---|
| Engine lifecycle | One straight line: prompt → fence → build → inspect → launch → end | A long-lived project: set up once, then a loop of turns that can run forever |
| Claude session | One run per prompt | One Claude session kept alive across all turns, so Claude remembers what it built; can be stopped mid-turn (resume after restart: CUT) |
| Tini | Plans once | Plans the full fence on the first prompt, then checks every later prompt for new access. No new access means no interruption. |
| Escalation | Only when Claude asks for more | Also when Maria's own prompt names something outside the fence; same card, different header |
| Tina | Inspects once at the end | Inspects after every turn; untouched segments keep their status |
| Launch | Final step | Unlocks when all green, locks again when a new turn starts |
| Workspace | Always a fresh folder | Fresh folder for new work, or her existing project folder when she wants Claude to work on something she already has (existing mode: CUT) |
| Report | One run | Cumulative across all turns |
| Replay | Pauses for clicks | Also pauses for prompts, and pre-fills the prompt bar so the presenter just presses Send |

**What stays the same:** the fence itself (Stage 0), the engine's plumbing, the AI ladder, the demo kit, Tina's checks and fixes, and submission.

**Time impact:** about 2.5 hours added to the engine. Every piece is therefore marked Must, Should, or Could, and the Must path alone fits before the midnight freeze (see Part 7).

---

## Part 2. The product model

**Project.** The unit of work: one fence, one workspace folder, one Claude session, one set of fence segments, one inspection status, one growing report. Only one project is open at a time. "New project" resets everything. Managing several projects at once is pitch-only.

**Turn.** One prompt from Maria and everything Claude does in response. Turns are numbered from 1.

### Lifecycle

**Setup (turn 1)**

1. Maria sends her first prompt (`start` command) → **planning:** Tini plans the fence, Tina pre-inspects the named folders.
2. The contract card appears → **contract:** Approve or Adjust.
3. On Approve → **fencing:** Tini stages the workspace and builds the segments.
4. **Building:** Claude works.
5. The turn ends → **inspecting:** Tina checks the new work.
6. → **ready.** Launch is unlocked if everything is green.

**Loop (every later turn)**

1. Maria sends a prompt (`prompt` command) from ready or launched. Launch locks.
2. **Access check:** Tini checks the prompt for anything outside the fence.
   - Nothing new: straight to building.
   - Something new: an escalation card with source "prompt," Tina inspects the folder, Maria decides, then building.
3. Building → inspecting → ready, same as setup.

### Rules that keep the loop from breaking

- **The prompt bar is enabled only in idle, ready and launched.** During every other phase it shows "Tini is working" and a Stop button. No queueing prompts during a turn, which removes a whole class of ordering bugs.
- **Stop** ends the current turn immediately (the SDK's interrupt call). The turn is marked "stopped by you," and Tina still inspects whatever was written.
- **A turn is finished only when all three are true:**
  - Claude has sent its final result for that turn.
  - No escalation is open.
  - No follow-up message is waiting.

  This matters when Maria approves extra files after Claude has already stopped: we send the follow-up, wait for the next result, and only then does Tina inspect.

- **Claude can't pop up questions.** Its question tool is off, so if it needs something, it asks in words at the end of its turn. That becomes the turn's result on the timeline, and Maria answers with her next prompt.

### The interface (not a chat window)

- **The yard is the interface.**
- **Maria's input is a prompt bar,** like giving work orders.
- **Her history is a turn timeline:** each prompt, with a one-line result under it.
- **Claude's words appear two ways:** as the dog's speech bubbles while it works, and as the turn's result when it finishes.

---

## Part 3. Locked decisions

1. **Enforcement never depends on AI.** Fences, sandbox, staging, fixes and the access check are plain code. AI only writes plans, labels, explanations and picks subsets, and every AI answer is validated.
2. **One `emit()` path.** Every event gets numbered, applied to the world state, written to the recording and broadcast, all in one place.
3. **The game only knows port 4000.** Mock, live and replay are all the same to it.
4. **The AI ladder:** saved answer → Gemini Flash (8-second timeout, one retry) → Claude Haiku 4.5 → a hard-coded fallback. It's proven with a 100-run stress test.
5. **The follow-up access check is code only, no AI.** It finds paths and web addresses in the prompt and compares them to the fence. It's instant, costs nothing, and can't fail. AI is only called when a genuinely new folder shows up, for the inspection summary.
6. **The demo runs from a recording, and the attack runs through a harness labeled "simulated."** Everything else in the recording is a real run.
7. **The story's triggers live in the demo files.** Examples: the Jobsite2024 pointer in About, the Maps key in the client info.
8. **Demo files live at `~/Clients/Rivera/...`.** Fake secrets are generated on the laptop and never committed (GitHub push protection would block them).
9. **Offline-capable demo.** No CDNs anywhere in the game.
10. **The contract only grows after Checkpoint A.** Additive changes only.
11. **CUT: existing mode (fresh folder only).** **The workspace has two modes.** New work gets a fresh folder in `~/tini-projects/`. Existing work fences around the folder Maria names. Any other folder she mentions is always copied in cleaned, never opened in place.
12. **CUT (with existing mode).** **Existing folders get a pre-inspection too.** If Maria's own project folder contains `.env` or key files, the contract card offers to hide them from Claude. Hidden files are added to the fence checker's deny list and the sandbox's read block, so the fence works inside the yard, too.
13. **Photos red finding.** (Vision CUT: the metadata fallback is the plan.) Gemini vision on the images that will be published (with consent on the contract card) is a Should. If it's cut, the fallback is Tina finding leftover identifying metadata, such as the camera owner's name, in a published photo.
14. **Launch means "release."** For a website, Launch serves the site. For any other task, it means "the results are cleared to leave the yard," and opens the output folder.

---

## Part 4. Engine architecture

One local Node.js process in TypeScript, listening only on 127.0.0.1:4000.

### Core

| Module | Job |
|---|---|
| `server.ts` | Express + Socket.IO. Snapshot on connect, receives commands, serves the finished game build, serves launched sites on port 5050. |
| `project.ts` | The project and turn state machine from Part 2, plus the single `emit()`. Rejects commands that don't fit the current phase. |
| `store.ts` | Saves `project.json` (fence, segments, workspace mode, Claude session id, turn list) after every turn, so a restart can resume (resume: CUT). |
| `recorder.ts` | Writes every event and command to a JSONL file. |
| `replay.ts` | Plays recordings. Pauses at clicks and prompts, and sends the recorded prompt text ahead of time so the game can pre-fill the bar. |
| `ai.ts` | The AI ladder. |

### Tini

| Module | Job |
|---|---|
| `guard.ts` (done) | The fence checker, plus a per-file hidden list inside the workspace. |
| `dog.ts` (done) | Claude's settings. Gains the per-file hidden list and the added instructions. |
| `tini/planner.ts` | The full fence on turn 1. |
| `tini/access.ts` | The follow-up access check on every later turn. |
| `tini/stager.ts` | Fresh workspace (existing: CUT); copies in cleaned folders. |
| `tini/escalation.ts` | One pipeline for both sources: Claude asking, or Maria's prompt naming something new. |

### Dog

| Module | Job |
|---|---|
| `runner.ts` | The persistent Claude session. Turn boundaries, Stop, resume after restart (CUT), file actions → bricks, denials → sparks, Claude's text → speech bubbles and turn results. |

### Tina

| Module | Job |
|---|---|
| `tina/scanner.ts` | One scanner for folder inspection and per-turn inspection. |
| `tina/vision.ts` | **CUT.** Gemini vision on images that will be published. |
| `tina/explain.ts` | Explanations, cached per finding type. |
| `tina/fixes.ts` | Fix templates, each followed by a rescan. |

### Other

| Module | Job |
|---|---|
| `report.ts` | Cumulative, organized by turn. |
| `harness.ts` | The simulated attack. |

### Libraries

| Job | Tool |
|---|---|
| Running Claude | Claude Agent SDK 0.3.283, with an Anthropic API key |
| AI calls | `@google/genai` for Gemini; the Anthropic API for the Haiku fallback |
| Validating AI answers | zod |
| Copying files | fs-extra |
| Photo metadata | exiftool-vendored |
| Secret scanning | gitleaks from Homebrew, with our own regex as fallback |
| Reading PDFs | pdf-parse |
| Generating demo images | sharp |

### Contract additions (Stage 1)

- a `stop` command
- a `prompt.suggested` event, which replay uses to pre-fill the prompt bar

Already added in contract v1.1: `turn.started`, `turn.finished`, `launch.locked`, the `prompt` command, and the `source` field on escalations.

---

## Part 5. The stages

Each stage lists why it matters, what gets built, how it works, and "done when." Items are marked **[Must]**, **[Should]**, or **[Could]**.

### Stage 0. Prove the fence (45 minutes) [Must]

**Why:** Our whole claim is that the agent can't reach outside the room. We prove it before building anything on top of it.

**What you do:**
- Run the spike.
- Install gitleaks and exiftool with Homebrew.
- Get the Anthropic key (about $20 of credit) and the Gemini key.
- Enable billing on the Gemini project. That fixes rate-limit errors (429s), not overload errors (503s).
- Check `which node`. If Node is under the home folder, add its folder to `allowRead` in `dog.ts`.

**Done when:**
- All five spike checks pass. Check 5, the follow-up message in the same session, is the foundation of the whole turn loop.
- The guard tests pass.

**Fallback:** If check 3 (the sandbox-only bypass) still fails after 45 minutes, drop the sandbox layer. Keep staging plus the fence checker.

### Stage 1. Engine backbone and AI ladder (2.25 hours) [Must]

**Why:** Every later stage plugs into this. A loop built correctly now can't be retrofitted cheaply at 9 PM.

**Build:**
- `server.ts`, `project.ts`, `recorder.ts`, `replay.ts` and `ai.ts`
- the two contract additions
- start commands for live, replay and observe (unfenced) modes

**How the turn loop works:**
- `project.ts` holds the phase machine from Part 2. Turn 1 and later turns go through the same `runTurn()` function; only the planning step differs.
- For now, every module is a stand-in that emits realistic events, so we can test the loop without Claude.
- Replay pauses at recorded prompts and clicks, and sends `prompt.suggested` before each prompt.

**How the AI ladder works:**
- Every AI call goes through `ai.ask(task, input, schema)`.
- The saved answer is keyed on a hash of the task and input.
- A fault switch lets us force Gemini to be overloaded, rate-limited, hang, or return garbage. It can also force Claude to fail at the same time.

**Done when:**
- The mock's test client passes three turns against the real engine in stand-in mode.
- The run's recording replays and passes again.
- The ladder stress test gives 100 valid answers out of 100, under every forced failure, each within about 20 seconds.

### Stage 2. Demo kit (1.5 hours) [Must]

**Why:** Tini and Tina are developed against the exact files the judges will see.

**Build:** `npm run demo-kit`. It deletes and rebuilds everything in about two minutes.

**`~/Clients/Rivera/`:**
- **Photos:** about 31 photos with GPS. One is a real photo taken at the event, with the teammate's consent, showing a face and a license plate. That photo also keeps identifying metadata beyond GPS, for the Tina fallback.
- **About:** the company description, the sentence pointing to ~/Pictures/Jobsite2024, the Maps key (assembled at runtime), and a "downloaded template" file with the hidden ~/.ssh instruction.
- **Services:** the list of services.

**`~/Pictures/Jobsite2024/`:**
- 12 descriptively named job-site photos
- about 1,199 generated personal-photo stand-ins, mostly GPS-tagged
- `scan_0012.pdf`, a fake driver's license with a text layer

**For the follow-up beat:** `~/Documents/Rivera-HR/` with 7 job descriptions and one file containing a password.

**For the non-website tests:**
- a small CSV of sales numbers
- a folder of photos to rename
- a tiny existing app with a bug and a `.env` file

**Done when:** Two runs of the script in a row produce identical folders, and exiftool shows GPS exactly where expected.

### Stage 3. Tini: fence planning, per-turn access, staging (3 hours)

**Why:** This is the core idea: least privilege written from the prompt, maintained across every prompt.

**Build:** `tini/planner.ts`, `tini/access.ts`, `tini/stager.ts`, and Tina's folder pre-inspection (the first use of the scanner).

**Turn-1 planning [Must]:**
- Code finds every path in the prompt. Each one is checked: it must exist, sit inside the home folder, and not be a sensitive location.
- **CUT (always new mode):** It decides the workspace mode. A path to a folder with code in it, plus words like "fix," "update" or "my app," means existing mode. Anything else means new mode. The contract card shows which mode was chosen, so Maria can correct it with Adjust.
- The AI ladder receives the prompt plus only folder names and file counts. It returns segment labels, their purposes, whether packages or websites are needed, and the plain-English contract lines.
- Tina pre-inspects:
  - she counts GPS-tagged photos;
  - she flags risky files;
  - **CUT:** in existing mode, she lists `.env` and key files and offers to hide them.
- Adjust re-plans with the extra text added.

**Staging [Must]:**
- On Approve: create the workspace (new mode) or adopt the named folder (existing mode).
- Copy every other folder into `assets/<segment>/`, stripping GPS.
- Emit segments and box carries.
- Save `project.json`.

**Per-turn access check [Must]:**
- On each later prompt, code extracts paths and web addresses and compares them to the fence.
- Nothing new: go straight to building.
- Something new: hand it to the escalation pipeline with source "prompt." Maria's text is held until she decides, then sent to Claude.

**Done when:**
- The Rivera prompt produces the right five segments and a correct contract card, with zero GPS in the copies and the originals untouched.
- The four non-website prompts each produce a sensible fence:
  - analyze a CSV and make charts
  - rename photos in a folder
  - ~~fix the bug in the existing app, with the `.env` hide offer~~ **CUT**
  - a follow-up needing nothing new, which gets no card

**Side task (15 minutes):** Claim the GoDaddy domain at the MLH table now and point it at a placeholder Vercel page. DNS needs hours.

### Stage 4. The dog: one Claude session across turns (2.5 hours) [Must]

**Why:** This connects real Claude to the game and makes the loop real.

**Build:** `runner.ts`.

**How it works:**
- The runner opens one Agent SDK session with the Stage 0 settings, plus our added instructions describing the fence and the assets.
- Each turn pushes Maria's prompt (with her real paths swapped for their `./assets` paths) into the open session.
- A turn ends at Claude's result message, plus the three conditions from Part 2.
- Things Claude does become events:

| Claude does | Maria sees |
|---|---|
| Successful file actions (PostToolUse) | Bricks |
| Denials from the fence checker | Sparks |
| A sandbox "Operation not permitted" in a command's output | Sparks labeled as the OS layer |
| Claude's text while working | Short speech bubbles |
| Claude's final message | The turn's result on the timeline |

- The question tool stays off: our six-tool list doesn't include it.
- **Stop** calls the SDK's interrupt.
- There's a per-turn budget cap and a turn limit.

**Resume after a restart [Should] — CUT:**
- The Claude session id is saved in `project.json`.
- On restart, the engine reopens the same session with the SDK's resume option, and the game gets the rebuilt snapshot.
- If resume fails, the project continues in a new Claude session, with a short note telling Claude what's already in the workspace.

**Done when:**
- A live three-turn run completes: build the site, add a page, change a color.
- Each turn shows its result, bricks keep accumulating, and Stop works mid-turn.
- The recording replays.

**Checkpoint A (target: Saturday midday):** The real engine drives the teammate's game on Sultan's Mac through turn 1 and one follow-up turn. From here on, push a real recording after every good run.

### Stage 5. Escalation from both sources, plus the attack (2.5 hours) [Must]

**Why:** This is the product making a smart choice instead of a blunt one, in both directions: when Claude asks for more, and when Maria asks for something new.

**Build:** `tini/escalation.ts`, Tina's folder inspection, and `harness.ts`.

**How it works:**
- **Two kinds of denial.** When the fence checker denies something, it's sorted:
  - Sensitive locations are a hard block with no card: keys, credentials, `.ssh`, `.aws`, `.env`, password stores, and files hidden in Stage 3.
  - Anything else becomes an escalation, one per folder no matter how often it's retried.
- **Maria's own prompt** naming a new folder enters the same pipeline, with source "prompt."
- **Tina's local inspection** of the requested folder covers:
  - counts
  - GPS
  - risky names
  - PDF text patterns (this is what catches the license)
- **Picking the subset.** The AI ladder gets only names, structure and the metadata summary, and picks the subset that matches the request. Falls back to name matching.
- **Three options:**
  - Narrow copies in the subset, cleaned, as a new segment.
  - All copies everything.
  - Deny adds nothing.
- **Delivery.** For a Claude-sourced request, Claude gets a follow-up message: "approved files are in ./assets/…". For a prompt-sourced one, Maria's held prompt is sent with the new paths, or with a note that the folder was denied.
- **CUT: Web addresses and packages [Should].** Claude reaching a site outside the list becomes a smaller escalation: allow this site, or deny.
- **The harness.** It fires the ~/.ssh read through the real fence checker, labeled simulated. It's triggered from the raw view, or automatically at a fixed point in demo mode.

**Done when:**
- Live: Claude follows the Jobsite2024 pointer, and the card shows the right numbers.
- All three choices behave correctly.
- A follow-up prompt naming `~/Documents/Rivera-HR` produces the prompt-sourced card, and the password file is left out when Maria chooses narrow.
- The harness block fires every time.

### Stage 6. Tina: per-turn inspection (3 hours)

**Why:** This is the "allergic to red" half. Now it happens after every turn, so nothing Claude changes can slip out.

**Build:** `tina/scanner.ts` (final side), `tina/explain.ts`. (`tina/vision.ts`: CUT)

**Every turn [Must]:**
- After each turn, Tina scans the workspace with:
  - gitleaks
  - the metadata check on images that will be published
  - risky file names
  - personal-data patterns
  - the "where data goes" list
- A demo-sized workspace scans in seconds, so a full scan each turn is fine. Incremental scanning of only changed files (CUT) is a Could, only needed for big existing repos.
- **Mapping findings to segments:**
  - A file that came from a staged folder lands on that folder's segment.
  - Scripts and dependencies go to Web packages, or the task's equivalent.
  - Everything else goes to Workspace.
- **Statuses:**
  - Segments that were green and had nothing new stay green.
  - Previously fixed findings that reappear turn red again.

**Vision [Should] — CUT (metadata fallback keeps Photos red):**
- Only new or changed images that will be published, only with consent.
- Results are saved, so each image costs one call ever.

**Explanations [Must]:**
- Two sentences per finding type from the AI ladder, with a template fallback.

**Done when:**
- Live on the demo kit: turn 1 produces exactly the expected reds.
- A follow-up turn that reintroduces a key turns the segment red again.
- A harmless turn leaves everything green.

### Stage 7. Fixes, Launch and relock, the report (1.5 hours) [Must]

**Why:** Red to green to Launch is the payoff. The relock is what makes the multi-turn story safe.

**Build:** `tina/fixes.ts`, launch, `report.ts`.

**Fixes:**
- Move the key out of the website: replace the map with a keyless embed link.
- Remove a photo: swap its references to another approved photo.
- Strip all metadata.
- Hide or remove a file.

Each fix is followed by a rescan of that segment. It turns green only if the rescan is clean.

**Launch:**
- Unlocks when every segment is green.
- A new turn locks it again, with a reason.
- For a website, Launch serves the site at localhost:5050. For other tasks, it opens the output folder.

**Report:**
- Cumulative across turns: allowed, blocked, narrowed, fixed, and where data goes.
- Each line is tagged with the turn it happened in.

**Done when:** A live run covers prompt, fixes, launch, a follow-up turn, the relock, re-inspection, launch again, and a report showing both turns.

**Checkpoint B (target: Saturday evening):** The full multi-turn flow runs on Sultan's Mac with the teammate's game, both live and from a recording. Anything not working goes into the cut list, not into more hours.

### Stage 8. Demo hardening (1.5 hours, finish by midnight) [Must]

**Why:** Judges see the demo, not the code.

**Build:**
- **Recordings:** several clean live runs of the full demo script, including the follow-up beat. Keep the best as `demo-main.jsonl`, plus one backup.
- **"Without the guardian":** observe mode. The fence checker logs but allows, and there's no staging. The same prompts then really do read Jobsite2024, license included, and ship the key and GPS photos. Screen-record the dashboard for the opening 20 seconds.
- **A one-command demo start:** replay at 3× with the prompt bar pre-filled, and a Reset button.
- **Warm-up:** `npm run warm`, to fill saved AI answers for a live-mode backup.
- **Offline test:** Wi-Fi off.
- **App window:** open the game with Chrome app mode, `open -na "Google Chrome" --args --app=http://localhost:4000`, so it runs in its own window with no address bar and its own Dock icon. No Electron or Tauri wrapper before the deadline.

**Done when:** Three full replayed demos in a row with Wi-Fi off, with Sultan clicking and sending like a judge would.

**Feature freeze at midnight.**

### Stage 9. Overnight (about 3 hours, plus sleep) [Must]

- Fix only what the offline demo exposed.
- Record the clean backup video; it's also the Devpost video.
- Sleep at least 3 hours.

### Stage 10. Submission and pitch (Sunday 6 to 10 AM) [Must]

- **Landing page** on the GoDaddy domain: what it is, the video, the repo link.
- **Devpost:**
  - problem
  - the three-layer fence
  - "the sandbox exists, nobody configures it"
  - privacy by design
  - works for any Claude Code task, not only websites
  - Gemini as the reasoning engine with Claude as backup
  - built with Claude Code inside Tini's fence

  Enter Assurant, Microsoft, MLH Gemini and GoDaddy. Add the teammate early.

- **Rehearse ten or more times.** Prepared answers:
  - "Doesn't Claude Code already do this?"
  - "Who pays?"
  - "What if the AI is wrong?"
  - "Is this just a chatbot?" No: it's a workspace with a fence.

- **Submit by 10 AM.**

---

## Part 6. Proof: the demo script, beat by beat

| Demo beat | Built in | Proven by |
|---|---|---|
| First prompt → contract card with GPS line | Stages 2, 3 | Stage 3 test |
| Fence segments, boxes carried in | Stage 3 | Stage 3 test |
| House grows from real file activity | Stage 4 | Stage 4 test |
| ~/.ssh block with sparks | Stages 0, 5 | Stage 0 (fence is real) + Stage 5 (beat fires every time) |
| Claude asks for Jobsite2024 → narrow to 12 | Stages 2, 5 | Stage 5 test |
| Two reds with explanations | Stages 2, 6 | Stage 6 test |
| Fixes → green → Launch | Stage 7 | Stage 7 test |
| Follow-up "make the header darker" goes straight through, Launch relocks and reunlocks | Stages 3, 4, 6, 7 | Stage 7 test |
| Access report across turns | Stage 7 | Stage 7 test |
| Same flow with Wi-Fi off | Stage 8 | Stage 8 test |
| "Without the guardian" opening | Stage 8 | Stage 8 recording |

Checkpoints A and B put the teammate's game on the real engine twice before the freeze. No beat depends on an untested stage, on Gemini being up, or on a lucky live run.

---

## Part 7. Time budget and cuts

**Must path:** Stages 0 to 8 without their Should and Could items, about 15.5 hours of engine work. Should items add about 2.5 hours:
- resume after restart
- vision
- escalations for web addresses and packages

If we're more than 2 hours behind at a checkpoint, cut in this order:

1. Semgrep and npm audit (never started)
2. Incremental scanning (CUT)
3. "Where data goes"
4. Web-address escalations (CUT)
5. Resume after restart (CUT)
6. Vision (the metadata fallback keeps Photos red) (CUT)
7. Existing-folder mode (demo still works; pitch it instead) (CUT)
8. The OS sandbox layer

**Never cut:**
- the turn loop
- the fence checker and staging
- both escalation sources
- gitleaks
- fixes and the relock
- recordings and the harness
