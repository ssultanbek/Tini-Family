# Tini Family — Devpost draft

> Draft for the ShellHacks 2026 submission. Every fact here comes from docs/ (MASTER_PLAN,
> STATUS, VERIFIED_FACTS, PRODUCT_CONTEXT). Items in [brackets] still need filling in.

**Tagline:** Your AI agent gets the keys to the room, not the house.

## Inspiration

We build with AI coding agents all the time, and so do more and more people who aren't engineers. The agent runs on your laptop with your permissions. It asks before it reads a folder or runs a command, and after the fortieth "Yes" nobody is reading anymore. People call this approval fatigue.

The part that surprised us is that the protections already exist. Claude Code ships permission rules, hooks and an operating-system sandbox. But by default the sandbox lets commands read the whole computer, `~/.ssh` and `~/.aws` included, and almost nobody writes those rules by hand for every task. So the agent that's building your client's website can also open your personal photos, your HR folder and your keys.

We wanted the safe setup to be the default one, without asking anyone to learn a policy language.

## What it does

Tini Family is a local desktop app that sits between you and Claude Code. You type what you want in a prompt bar, and a small family takes it from there. It's drawn as a 2D game: a yard, a fence, and a dog (Claude Code) building a house inside it.

**Tini** reads your prompt and builds a fence around only what the job needs. If you ask for a website that uses the photos in `~/Clients/Rivera/Photos` and the company info in two other folders, the fence has exactly those folders, the npm registry and a fresh workspace. You get one plain-English card: what the agent can use, what gets stripped ("31 photos contain GPS locations, removed before Claude sees them") and "Everything else on your Mac stays outside the fence." One Approve replaces dozens of unread Yes clicks.

**Tina** inspects folders before they come in and inspects the work after every turn. When the agent asks for more, say `~/Pictures/Jobsite2024`, she looks first: 1,212 files, 12 job-site photos, 1,199 personal photos, 903 with GPS, and a driver's license scan she found by reading the PDF's text. You get three choices: only the 12 job-site photos with locations removed (recommended), the whole folder, or deny. After each turn she scans what the agent wrote. A problem turns the fence segment it came from red, like an API key in the page code or a photo that still carries the camera owner's name. Each one gets a plain explanation and a one-click fix. Launch stays locked until every segment is green, and it locks again when you ask for the next change.

At the end you get an access report covering every turn: what was allowed, blocked, narrowed and fixed, and which outside servers the site talks to.

It works for any Claude Code task, not only websites. Launch serves a website on localhost, and for other tasks it opens the output folder. We tested fences for analyzing a CSV and making charts, for renaming photos in a folder, and for a follow-up prompt that needs nothing new and goes straight through.

## How we built it

The engine is one TypeScript process on the laptop, bound to 127.0.0.1. It runs Claude Code through the Claude Agent SDK and keeps one session open across turns, so Claude remembers what it built.

The fence has three layers, and none of them depends on AI:

1. **Staging.** Claude works in a fresh folder under `~/tini-projects/`. Tini copies in only the approved files and strips GPS on the way. If a photo can't be proven clean, it's left out. The originals are never touched.
2. **A PreToolUse hook on every action.** Every Read, Write, Edit, Glob, Grep and Bash call is checked. Paths are resolved, symlinks included, and anything outside the workspace or any domain not on the list is denied on the spot with a plain reason. Subagents and web tools are switched off.
3. **The macOS sandbox (Seatbelt) as the backstop.** Hooks and permission rules cover Claude's own file tools, not a subprocess like `cat` inside Bash. We configure the SDK's sandbox to deny reads of the home folder except the workspace, allow writes only there, and allow network only to the listed domains.

When Claude needs something outside the fence, it can ask through a small tool we gave it, `request_access`. The request is denied right away and Claude keeps working. Tina inspects the folder in parallel, and approved files arrive later as a follow-up message. We never hold Claude inside a permission callback while a human decides.

The AI helpers go through what we call the AI ladder: a saved answer first, then Gemini Flash with an 8-second timeout and one retry, then Claude Haiku 4.5, then hard-coded wording. It never throws. Gemini writes the fence labels and contract lines, suggests which files in a requested folder match the job, and writes Tina's explanations. Every answer is validated with zod, and code decides what actually happens. The AI sees folder names, file counts and redacted snippets, never file contents or secret values.

Tina's checks are gitleaks for secrets, exiftool for photo metadata, PDF text extraction plus our own patterns for licenses, SSNs, card numbers and passwords, and risky file names. Fixes are templates. Moving a key out replaces a key-based Google map with a keyless embed. Removing a photo repoints its references to another approved one. Every fix is followed by a rescan.

Every engine event goes through one `emit()`. It's numbered, applied to the world state, written to a JSONL recording and broadcast over Socket.IO. The recording doubles as a replay file. The game is Phaser for the yard and React with Framer Motion for the cards, and it only draws what the engine tells it. A raw view shows the actual hook log for anyone who suspects the cute part is fake.

## Challenges we ran into

**Claude caught our attack before our fence could.** The demo's client folder includes a "downloaded website template" with a hidden instruction to read `~/.ssh/id_rsa` and paste it into the site. In a live run, Claude read the template, called it a prompt-injection attempt, and refused on its own. That's good news about the model, but it meant the demo's blocked-attack moment wouldn't happen reliably, and a safety tool shouldn't depend on the agent being suspicious. So the attack beat runs through a harness. It pushes the same Read of `~/.ssh/id_rsa` through the real fence checker and shows the real block, and it's labeled "simulated" on screen. The harness never opens the file.

The same wariness caused a second problem. Right after catching the injected template, Claude read the client's note pointing to `~/Pictures/Jobsite2024` and didn't ask for it. Our first design only noticed Claude's needs when the hook denied something. So we built the request door: a `request_access` tool whose description says asking is always safe, including for material the owner's files point to. In the next live run, Claude asked for the folder, the card showed the right numbers, and the gallery used only the 12 approved photos.

**Gemini was overloaded at the worst times.** We saw real 503 "high demand" errors, and there are reports of requests that hang with no error at all. Setting the SDK's own timeout to 8 seconds didn't work either: the SDK sends it to Google as a server deadline, and the API rejects anything under 10 seconds. That's why every AI call goes through the ladder, with our own client-side timer, one retry, Claude Haiku as the backup and fixed wording last. A stress test with forced failures (overloaded, rate-limited, hanging, garbage output, and both providers down) returned 100 valid answers out of 100.

**Paths hide in strange places.** Our Bash path check first read `sed 's/a/b/'` as a command touching `/`, and a `grep "</div>"` as a path. Both showed up as false sparks in live runs. The fixes had to keep real paths like `/etc/passwd` blocked.

**Claude tried to preview its own site.** It started `python3 -m http.server` and tried to curl localhost, and the network rule blocked it. Now website turns tell Claude that Tini launches the site after Tina's check.

## Accomplishments that we're proud of

- The fence is real. Before building anything else, we proved that the hook blocks Claude's Read tool outside the workspace and that the OS sandbox blocks a Bash `cat` the hook didn't catch ("Operation not permitted"). All five spike checks passed.
- In a live run, Claude asked for a folder its client's files pointed to. Tina found a license scan among 1,212 files, and a narrow approval delivered exactly 12 clean photos. That run cost $1.32 in API usage.
- The safety decisions never depend on AI. If both AI providers are down, the fence, the inspection and the fixes all still work, with built-in wording.
- There's no chat window. The yard is the interface, with a prompt bar and a turn timeline.

## What we learned

"The sandbox exists" and "the sandbox is configured" are very different things. The default leaves reads wide open. Permission rules don't cover Bash subprocesses, and the Read tool isn't sandboxed at all. You need several layers, and a single place where they're all written from the same intent.

Read the SDK's fine print. `maxTurns` is per user turn, but `maxBudgetUsd` covers the whole session, and `total_cost_usd` on each result is cumulative. We had over-counted our own spike's cost by adding up results. The dog now has a per-turn cost cap of our own, enforced with an interrupt.

Models are getting good at spotting injected instructions, which is great. But the protection has to hold even on the day the model doesn't notice.

## What's next for Tini Family

- **Existing-folder mode:** fence Claude inside a project you already have, and hide its `.env` and key files from the agent.
- **Resume after a restart,** and **escalations for new websites**, not only folders.
- **Gemini vision with consent,** only on the images about to be published, to catch faces, plates and ID cards in the background.
- **Teams:** company-wide rules ("never allow the Finance folder") and every access report in one place, for companies where non-engineers build tools with coding agents.

## What's real and what's simulated

- **Simulated:** the SSH-key attack beat. A harness sends a Read of `~/.ssh/id_rsa` through the real fence checker, and the result is labeled "simulated" in the app. Nothing is ever read.
- **Fake data:** the whole demo world. That includes Rivera Construction, its photos and GPS tags, the Maps key (generated on the laptop, never committed), the driver's license marked SAMPLE, the 1,199 personal-photo stand-ins, and the HR login file.
- **Recorded:** the table demo plays back a recording of a real live run, because a real build takes minutes. Everything in it except the attack beat is what Claude Code, Tini and Tina actually did.
- **Real:** the fence (hook and sandbox), staging, Tina's scans and fixes, the AI ladder, and live mode.

---

## Challenges we're entering

**Assurant — Take Control of AI.** This track asks for privacy protection, spending visibility and mindful AI use, and that's the core of the project. The agent only gets the folders your prompt names. Photos lose their GPS before the agent sees them. Private documents are found by content and kept out unless you say otherwise, and nothing leaves until Tina clears it. On spending, the agent runs with a per-turn cost cap, a turn limit and a session budget, and our own AI helpers fall back to saved answers before making a new call.

**Microsoft — What's Missing?** The missing piece in AI coding tools is a safe default for access, and we built it into the experience instead of beside it. It does a real task, building and shipping software, with AI inside the workflow. There's no chatbot or chat window: you give work orders in a prompt bar, the yard shows what the agent is doing, and your history is a turn timeline.

**MLH — Best Use of the Gemini API.** Gemini is the first rung of our AI ladder, with structured JSON output validated by zod. It turns a prompt and folder counts into fence labels and a plain-English contract, picks which files in a requested folder match the job from names and a metadata summary, and explains each finding in two plain sentences. Gemini only sees summaries and redacted snippets, and code checks every answer, so it helps without ever deciding access.

**MLH — GoDaddy Registry.** Our landing page lives at [domain], a GoDaddy Registry domain. It explains the product and links the demo video and the source.

---

**Built with:** TypeScript, Node.js, Claude Agent SDK, Claude Code, Gemini API, Claude Haiku 4.5, macOS Seatbelt sandbox, gitleaks, exiftool, pdf.js, zod, Express, Socket.IO, Phaser, React, Framer Motion, Vite.

**Links:** [demo video] · https://github.com/ssultanbek/Tini-Family · [domain]
