> **Read this first.** This is the original handoff from the ideation chat. It explains the product,
> the problem, the characters, the demo story and the pitch. Where it conflicts with
> `docs/MASTER_PLAN.md`, **the master plan wins**. The main things that changed since this file:
> the product is a multi-turn workspace for any Claude Code task (not one prompt, not only websites);
> no chat window (prompt bar + turn timeline); Agent SDK with an API key is decided (Option A);
> the subagent tool is now called `Agent`, not `Task`; every AI call goes through the AI ladder
> (Gemini first, Claude Haiku as backup, hard-coded fallback last); Gemini vision is a Should, not a Could;
> demo files live at `~/Clients/Rivera/...`, not `/Clients/...`.

# Tini Family: Project Context (ShellHacks 2026)

This file is the complete handoff from the ideation chat to the execution chat. Everything below marked **Decided** is locked. Everything marked **To finalize** is for the execution chat to settle.

---

## 1. The event and the goal

- **Event:** ShellHacks 2026, Florida's largest hackathon (10th anniversary), FIU, organized by INIT. About 1,200 hackers, 36 hours.
- **Hacking window:** Friday Sept 25, 11 PM to **Sunday Sept 27, 11 AM**. Devpost submission is due by 11 AM Sunday; organizers asked teams to start submitting by 10 AM. **Our target: submitted by 10 AM.**
- **Goal:** **1st place, Best Overall.** Everything else serves that.
- **Best Overall criteria (official):** creativity, execution, impact. All projects are entered automatically. Judged at the team's table (expo style), about 3 to 5 minutes per judge visit.
- **Best Overall prizes:** a MacBook pool, Sony XM5 headphones, React Miami tickets. 1st place picks first. At least one team member must be at the closing ceremony to claim the prize (1 minute to choose on stage).
- **Team:** Sultan (FIU CS student, Business Analytics concentration, founder; builds the core engine) and a teammate who is **not technical** (builds the entire front end/game with AI coding help, under strict rules).

---

## 2. What we learned in research (why this idea)

### Patterns in past ShellHacks winners (2020 to 2025, verified on Devpost)
- **Best Overall winners solve a relatable human problem with a demo that visibly works.** They are rarely the trendiest tech. Examples: ESPER (2024, Chrome extension for photosensitive epilepsy), IntelliSchedule (2023, ratings inside FIU registration), EcoSort (2025, built on no-code Base44).
- **Something that sees or senses the real world** shows up in top spots almost every year, because it demos well at a table.
- **Sponsor tracks carry the trends** (Web3 in 2021 and 2022, VR in 2023, agents in 2025). Trends vanish when sponsors leave.
- **Execution beats complexity.** MedVoyage placed 3rd with plain HTML/CSS/JS. Lumi Lens won with a simulation fallback when its live feature broke.
- **AI changed roles:** it was the product in 2023, an ingredient in 2024, the builder and worker in 2025. In 2026, "we used AI" impresses nobody. What matters is what the AI lets the project *do*.
- Chatbots are the default everyone builds. Microsoft's 2026 challenge explicitly bans chat-window products.

### Signals from the 2026 opening ceremony
- **Cybersecurity** came up from the InitFIU faculty sponsor (AI leadership, cybersecurity entrepreneurship) and in the Dean's faculty showcase (post-quantum security, crypto agility).
- **AI framed as woven into everything,** never the product itself.
- **Ambition encouraged:** build something unfamiliar, it could matter in 10 years.
- Event theme **"In It":** start, finish, continue. Finished projects with a life after Sunday fit the culture.
- Also heavily mentioned: energy grid and critical infrastructure, and FIU's new IonQ quantum computer. Neither fits us, and a quantum gimmick is a trap.

### 2026 challenges we target (all stack onto one project)
| Challenge | Why it fits |
|---|---|
| **Best Overall** | Main target |
| **Assurant, "Take Control of AI"** | Asks for privacy protection, spending visibility, and mindful AI use. Our strongest sponsor fit. |
| **Microsoft, "What's Missing?"** | Real task accomplished, AI inside the experience, **no chatbot or chat window**. Our design matches it. |
| **MLH, Best Use of Gemini API** | Gemini is our reasoning and explanation engine |
| **MLH, GoDaddy Registry** | Free domain for the landing page (5 minutes) |
| Optional: MLH DigitalOcean, ElevenLabs | Only if used naturally or time allows |

**Not targeting:** Sperry Tech GridLock (off-direction; internship prize considered and declined), Blackstone, State Farm, Waymo, INIT Building Together, Solana, Snowflake, Tiger Data, MongoDB.

---

## 3. The product (Decided)

### One sentence
**Tini Family is a safety crew for AI coding agents: your agent gets the keys to the room, not the house, and nothing leaves until Tina says it's clean.**

### The problem
People (students, freelancers, non-engineers at companies) now build software with AI coding agents like Claude Code. The agent asks permission for folders, files, commands and websites. People click "Yes" without reading, because they trust the agent and want to keep moving. This is documented as **approval fatigue**. Results:
1. **Over-access:** an agent building a simple website can end up able to read the whole Pictures folder, Downloads, tax documents, SSH keys. Claude Code's built-in sandbox limits *writes* to the project by default, but *reads* are broad by default, and nobody configures it by hand.
2. **Leaks at launch:** what the agent builds can publish secrets and private data: an API key in frontend code, GPS home locations hidden in photo metadata, an ID card visible in a photo's background.
3. **Hidden instructions:** a downloaded template can contain instructions telling the agent to read private files (prompt injection).

### The solution: two agents, shown as a family in a 2D game
- **Tini (husband): the fence builder and gatekeeper.** Reads the user's prompt, works out exactly what the agent needs (folders, packages, commands, websites), and builds a fence around only that. Enforces it on every action. When the agent asks for more, he brings the request to the user in plain language, with Tina's inspection, and offers the **narrowest safe option**.
- **Tina (wife): the inspector.** She's **allergic to red.** She inspects folders before anything enters the yard, and does a final inspection before launch. Every problem appears as a **red fence segment on the part of the fence where it came from.** She explains it in plain words, the user clicks fix, and it turns green. **Nothing launches until the whole fence is green.**
- **The dog: Claude Code itself,** building the house (the project) inside the yard. It is our own original character: never use Anthropic's logo or mascot art.

### Positioning (critical for judges)
Claude Code already ships enforcement machinery: permission rules, hooks, and an OS-level sandbox. **We are not reinventing sandboxing.** The pitch: **"The sandbox exists. Nobody configures it. Tini writes the borders automatically from what you asked for."** That's intent-based least privilege: prompt in, policy out. When a judge asks "doesn't Claude Code already do this?", this is the answer.

### Taglines
- "Your agent gets the keys to the room, not the house."
- "Least privilege, written from your prompt."
- "We built it with Claude Code, inside Tini's fence."

### Who it's for
- **Now (the demo persona):** students and beginners vibe coding with Claude Code, the extreme case, least likely to read permissions.
- **Also:** freelancers and agencies (client files on the same laptop; the access report is a trust signal to clients).
- **The eventual buyer (pitch only, not built):** companies where non-engineers (marketing, ops, analysts) build tools with coding agents on laptops full of company data. They'd set company-wide rules ("never allow the Finance folder") and see every report in one place.

---

## 4. The end-to-end user workflow (Decided)

Demo persona: **Maria, a business student doing a freelance website for Rivera Construction.**

1. **Setup:** she opens the Tini Family app on her Mac. An empty yard, Tini, Tina, the dog napping. Nothing is scanned yet: Tini only looks where she points.
2. **Request:** "Build a modern, serious-looking website for Rivera Construction with a gallery of this year's projects, a map of our office on the Contact page, and our team photo on the About page. Use our Google Maps key from the About folder so our custom pin shows. Use the photos in ~/Clients/Rivera/Photos and the company info in ~/Clients/Rivera/About and ~/Clients/Rivera/Services." (then T2: "Add this year's job-site photos from ~/Pictures/Jobsite2024 to the gallery." and T3: "Make the header darker.")
3. **Plan:** Tini works out the fence: 3 folders, npm packages, the project workspace. Tina pre-inspects those folders.
4. **Contract:** one plain-English card: what Claude can use, what's stripped (e.g., "31 photos contain GPS locations, removed before Claude sees them"), and "everything else on your Mac stays outside." **One Approve replaces forty unread "Yes" clicks.**
5. **Fence:** Tini walks the yard placing labeled fence segments (Photos, About, Services, Web packages, Workspace) and carries copies of approved files into the yard. Real folders stay untouched.
6. **Build:** the dog builds. Every file read/written = a brick in the house.
7. **Blocked attempt:** a downloaded template tells the agent to read `~/.ssh`. The dog bumps the fence, sparks fly, it's blocked and logged with a plain-English reason.
8. **Escalation:** the dog asks for `~/Pictures/Jobsite2024`. Tina inspects: 1,212 files, 12 job-site photos, 1,199 personal photos, 1 driver's license scan, 903 with GPS. Options: **Allow only the 12 job-site photos, locations removed (recommended)** / Allow the whole folder / Deny. Claude keeps building while she decides.
9. **Inspection:** when the build finishes, Tina walks the fence. Red segments: Web packages (API key in frontend code) and Photos (a worker's face and a license plate in one photo). One-click fixes turn them green.
10. **Launch + receipt:** Launch unlocks only when all segments are green. An access report lists what was allowed, blocked, narrowed and fixed.

A visual mockup of the four main screens (Plan, Build, Escalation, Inspect) exists in the ideation chat as a design canvas.

---

## 5. How it works technically (Decided concepts; details To finalize)

### Everything runs locally
A website on Vercel **cannot** reach into the user's laptop, and shouldn't. So:
- **The Tini daemon:** one local Node.js/TypeScript process on the user's Mac. It serves the game UI at `localhost`, pushes live events to it, runs Claude Code, and runs Tini's and Tina's logic.
- **The GoDaddy domain + Vercel** host only a landing page (what it is, demo video, download). That still qualifies for the GoDaddy prize.
- **Production story (pitch only):** the local app connects *outward* to a cloud dashboard for companies.

### The fence: staging + enforcement (three layers)
1. **Workspace staging:** Tini creates a fresh project folder (e.g., `~/tini-projects/rivera-site/`) and **copies in only approved files** (EXIF/GPS stripped on copy). Claude's working directory is that folder. Real folders are never exposed.
2. **In-process PreToolUse hook:** checks every Read/Write/Edit/Glob/Grep/Bash call; anything with a path outside the workspace (resolved with `path.resolve` + `fs.realpath` to defeat `../` and symlink tricks), or a network domain not on the allowlist, is **denied instantly with a plain-English reason** and emitted as a "blocked" event.
3. **Claude Code's OS-level sandbox as backstop:** needed because permission deny rules alone apply to Claude's own file tools, not to Bash subprocesses (`cat .env` through Bash). The sandbox enforces at the OS level (Seatbelt on macOS).

### Escalation: deny first, never hold Claude waiting
1. Claude requests something outside the fence.
2. The hook **denies immediately**, telling Claude: "Outside your workspace. The owner is reviewing it. Continue with other work; approved files will appear in ./assets/."
3. In parallel, Tina inspects the requested folder, and an escalation event goes to the UI.
4. The user decides.
5. Tini copies the approved subset into the workspace (cleaned).
6. The engine sends Claude a follow-up message in the same session: "Approved files are now in ./assets/…".

**Why:** a recent Agent SDK bug report says `canUseTool` has no configurable timeout and a timeout can kill the control channel permanently. So human-speed decisions must never happen while Claude is paused inside a permission callback.

### Tini's inspection of folders (privacy-first)
- He never scans the whole laptop, only folders the prompt names or Claude requests.
- **Local rules first:** filenames/extensions (`.env`, `.pem`, `id_rsa`, `passport`, `tax`, `bank`), secret patterns (gitleaks), personal-data regex (SSN, card numbers, phones) in text and PDFs, EXIF GPS.
- **Gemini sees summaries and flags, not the files.**
- **Gemini vision only with user consent,** only on images being used. Pitch line: "Uploading your private photos to a cloud AI to check if they're private would be the leak itself."

### Tina's final inspection
- Triggers when the agent stops (Stop event).
- Runs gitleaks, an EXIF check on everything in the build output, optionally Semgrep, npm audit, Gemini vision, and a "where your data goes" list of outside servers the site calls (displayed only; no compliance claims).
- **Findings map to fence segments by source** (assets → Photos segment, dependencies → Web packages, etc.).
- **Fixes are templates** (strip EXIF, move key to `.env`, blur/remove a photo, remove a file). Gemini writes only the plain-English explanations.

### Known gotchas to handle
- **Disable subagents:** deny the `Task` tool. Background subagents were reported to bypass permission callbacks, and deny rules hold in every permission mode.
- Permission rules don't stop Bash, so keep the OS sandbox on.
- Verify all Claude Code / Agent SDK behavior against current docs (code.claude.com/docs) before relying on it; details change between versions.

---

## 6. Tools and stack (Decided unless marked)

**Language:** TypeScript on Node.js everywhere, so the event contract is one shared file both sides import.

**The dog (Claude Code runner), To finalize with a 10-minute test tonight:**
- **Option A (preferred): Claude Agent SDK (TypeScript)** in-process, with TypeScript hooks. Likely needs an Anthropic API key with credits (budget ~$15 to $30).
- **Option B (fallback):** Claude Code CLI headless (`claude -p --output-format stream-json`) with shell hooks that POST to the engine. Can use a Claude subscription login.
- **Model:** Sonnet for build runs. Keep the demo site small and static (HTML/CSS/JS only).

**Tini's brain:**
- Gemini Flash (latest in Google AI Studio, free tier) with structured JSON output: prompt → fence manifest.
- zod: validate the manifest.
- fs-extra: staging copies.
- exiftool-vendored: strip GPS on copy.
- Agent SDK PreToolUse hook + `path.resolve`/`fs.realpath`: enforcement.
- Claude Code sandbox settings: OS backstop and network allowlist.
- Deny the `Task` tool.

**Tina's brain:**
| Tool | Priority |
|---|---|
| gitleaks (secrets) | Must |
| exiftool-vendored (GPS/metadata) | Must |
| Own filename/extension rules | Must |
| Gemini Flash (plain-English explanations) | Must |
| Own regex for personal data in text | Should |
| pdf-parse + same regex (PDFs, e.g., license scan) | Should |
| npm audit | Could |
| Gemini vision (with consent) | Could, big wow |
| "Where your data goes" map | Could |
| Semgrep | Could, cut first |

Skip trufflehog and Microsoft Presidio (too heavy for the weekend).

**The engine's body:**
- Express (server).
- Socket.IO (live events; auto-reconnects if the game page refreshes mid-demo).
- A hand-written state reducer (not XState).
- No database: in-memory state plus a **JSONL event log, which doubles as the replay file.**
- **Record-and-replay mode:** re-emit a recorded log at 1× to 5× speed. This is how the 3-minute table demo runs (a real Claude build takes minutes), and it's the Wi-Fi fallback.

**The game (teammate):**
- **Phaser 3** (most tutorials, so AI coding tools write it well), plus React/Framer Motion for cards and pop-ups.
- **2D top-down or isometric only. 3D is ruled out** (not feasible in the time).
- Art: **Kenney.nl free 2D packs** (fences, characters, houses, tiles). Pick, don't draw.

**Landing page:** Vercel + GoDaddy domain.

**Cut order if behind:** Semgrep → data map → npm audit → Gemini vision → OS sandbox layer (the hook remains the enforcer). Never cut the must-haves.

---

## 7. Architecture: the six parts

1. **Core engine (the spine):** runs Claude Code, holds world state, broadcasts events. Tini and Tina plug into it. *Owner: Sultan.*
2. **Tini:** prompt → fence plan → workspace + staging → hook enforcement → escalations. *Owner: Sultan.*
3. **Tina:** shared scanning engine for folder inspection and final audit, plus fixes. *Owner: Sultan.*
4. **Game UI:** map, characters, fence segments, house, escalation card, finding cards, contract card, raw-view toggle. *Owner: teammate.*
5. **Demo kit:** fake Rivera Construction folders, photos with GPS, a driver's license scan hidden in a folder, planted fake API keys, the poisoned template, the scripted attack harness, recordings. *Owner: both.*
6. **Submission and pitch:** Devpost write-up, demo video, landing page, pitch rehearsal. Protect 3 to 4 hours for this. *Owner: Sultan.*

### The engine–game boundary (strict rules for the teammate)
1. **The engine decides what and why. The game decides how it looks.**
2. **The engine never sends pixel positions,** only logical places: segment IDs and zones (`gate`, `yard`, `house`, `outside`).
3. **The game never makes decisions.** It sends back only user clicks: approve, adjust, allow-narrow, allow-all, deny, fix, launch, start.
4. **Animate events in order,** one at a time per character (queue them).
5. **A raw-view toggle** shows the actual config and hook log, which answers engineer judges who suspect the cute part is fake.
6. **New behavior = a new event in the contract,** added by Sultan, never logic invented in the game.

### Example events (the contract is To finalize together, first thing)
`fence.plan.proposed`, `fence.segment.built`, `tini.carry.box`, `dog.brick.placed`, `fence.blocked`, `escalation.opened`, `escalation.resolved`, `tina.inspect.started`, `segment.red`, `fix.applied`, `segment.green`, `launch.unlocked`.

---

## 8. Team workflow (Decided)

**Repo:** one GitHub repo, four folders:
- `/shared`: the event contract. **Only Sultan edits it.**
- `/mock`: the fake engine plus `/mock/recordings/`. Sultan builds it.
- `/game`: the whole front end. **Only the teammate edits it.**
- `/engine`: the real engine. **Only Sultan edits it.**

**Hour 1, together:** write the event contract. **Then Sultan builds the fake engine** (a script that plays scripted events on the same port the real engine will use, e.g., `localhost:4000`) and pushes it, ideally within an hour.

**All day:**
- The teammate builds the game against the fake engine and pushes every hour.
- Sultan builds the real engine piece by piece and **pushes each working piece immediately, not at the end.**
- Every real run saves a JSONL recording; Sultan pushes recordings to `/mock/recordings/` so the teammate tests against real engine output.

**The real engine runs only on Sultan's laptop** (Claude Code, API keys, demo folders). **All integration testing happens there:** pull the latest game, run it against the real engine.

**Every 2 to 3 hours:** a 10-minute integration check on Sultan's laptop.

**Git rules for the teammate:** pull before starting, push when something works, never edit another person's folder. Claude Code can run the git commands for him.

**Never "build separately and wire at the end."** Integrate continuously.

---

## 9. Timeline (deadline: submit by 10 AM Sunday)

| When | What |
|---|---|
| **Immediately** | **Hook spike (critical path):** prove a PreToolUse hook + sandbox rules block Claude Code from reading a file outside the project, both via its Read tool and via Bash `cat`. If it fails, fall back to staging-only (copy approved files into a clean workspace) plus the hook as best effort. |
| First hour | Event contract (together); SDK auth test; repo setup |
| First 1 to 2 hours | Fake engine pushed; teammate starts the game |
| Saturday midday | **Checkpoint:** the real fence plan drives the game on Sultan's laptop |
| Saturday afternoon | Escalation + narrowing; Tina's must-have checks with fixes |
| Saturday evening | **Checkpoint:** the full flow (plan, build, block, escalation, inspect, launch), live or from recording |
| **Saturday midnight** | **Feature freeze.** Only bugs and polish after this |
| Overnight | Record the fallback video and replays; fix bugs |
| Sunday 6 to 9 AM | Pitch rehearsal (10+ times), Devpost write-up, landing page |
| **Sunday 10 AM** | **Submit** |

**Saturday sessions worth attending (optional):** Assurant workshop 9 AM (hear what their judges value); MLH "Hacking with GitHub Copilot" 9 to 10 AM Room 355; MLH Gemini/AI Studio 1 to 2 PM Room 243.

**Free wins:** Instagram post with #ShellHacks (MacBook Air/iPad contest); GoDaddy domain; badge scans at sponsor tables.

---

## 10. The 3-minute table demo (draft)

1. **0:00 Hook:** "How many times did you click 'Yes' for your AI coding agent today? Did you read them?" (Optionally Sultan's own story of leaking an API key while vibe coding.)
2. **0:15 Without the guardian (pre-recorded):** the same prompt, and Claude reads far beyond what it needed; the site ships with a key and GPS-tagged photos.
3. **0:35 With Tini Family:** the prompt, then the contract card, then Approve. Tini builds the fence; the dog starts building.
4. **1:10 Red moment:** a poisoned template tries to read `~/.ssh`; it's blocked, with sparks. **Run through the scripted harness so it fires every time; be upfront that it's a simulated attack.**
5. **1:30 Escalation:** Claude wants a Pictures folder; Tina finds a license scan and GPS; allow only 12 photos, cleaned.
6. **2:00 Inspection:** two red segments; fix both; all green; Launch unlocks; the access report appears.
7. **2:40 Close:** "AI agents can touch everything on your computer. We make them touch only what you asked for."
8. **Q&A answers ready:**
   - "Doesn't Claude Code already do this?" → the sandbox exists, nobody configures it, and defaults leave reads wide open; Tini writes the borders from your prompt.
   - "Who pays?" → companies where non-engineers use coding agents.

Run the demo from **replay mode** (a real recorded run at 3 to 5× speed); live mode is a bonus. Let the judge click the escalation choice and the fix buttons themselves.

---

## 11. Risks and mitigations

1. **The hook spike fails** → staging-only fallback (Claude never sees real folders at all).
2. **Sultan owns the whole engine alone (~18 to 25 hours of work)** → strict cut order, recordings early, feature freeze at midnight.
3. **Art takes longer than motion** → ready-made Kenney packs only; the plain dashboard view of the same events is the fallback UI.
4. **Cute vs credible** → the raw-view toggle plus real blocks.
5. **Real builds are slow** → replay mode for the table.
6. **Engineer judges' "Claude Code does this" question** → the positioning in section 3.
7. **Trademark** → our own dog character; no Anthropic logos or mascot.

---

## 12. Ruled out during ideation (don't revisit)

- Vibe-code "translate code into plain English": Claude already does it, and 2025 winner GitFlow overlaps it.
- Face recognition → LinkedIn at networking events: a privacy nightmare, creepy to judges, violates LinkedIn's terms.
- Dorm/apartment safety scan with camera: a strong backup, but not chosen.
- Accident scene witness app: too close to 2025 winner GreenLight.
- Miami street hazard reporter: too close to 2025 winner OpenPotholeMap.
- Sperry Tech GridLock: not Best Overall material.
- 3D game: not feasible in the time.
- A B2B multi-employee dashboard as a built feature: pitch only.
- "Data localization compliance" claims: display "where your data goes" only.

---

## 13. First actions for the execution chat

1. **Hook spike** on Sultan's Mac (block Read and Bash `cat` outside the workspace).
2. **SDK auth test** (Agent SDK with existing login vs API key), then decide Option A or B.
3. **Create the repo** with `/shared`, `/mock`, `/game`, `/engine`.
4. **Write the event contract** (`/shared/events.ts`) with the teammate.
5. **Build and push the fake engine** so the teammate can start.
6. **Write the teammate's strict instruction file** for the game (rules, events, Phaser setup, art packs, git steps).
7. Then build the real engine in this order: Claude runner → Tini plan + staging + hook → escalation → Tina must-haves → fixes → replay → polish.
