// Drives a real (live) run, or its replay, through the four-turn Rivera story and reports
// what actually happened. Unlike loop.ts it asserts nothing about Claude's choices, only the
// loop's invariants; with --replay it checks the replay ends in the same state as the live run.
//   npx tsx test/live-client.ts --save <file.json>       (against --mode live)
//   npx tsx test/live-client.ts --replay --compare <file.json>   (against --mode replay)
import fs from "node:fs";
import { io } from "socket.io-client";
import { ENGINE_PORT, SOCKET, type EngineEvent, type GameCommand, type WorldState } from "../../shared/events.ts";
import { reduce } from "../../shared/reducer.ts";
import { SUGGESTED } from "../../mock/scenario.ts";

const argv = process.argv;
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i > 0 ? argv[i + 1] : undefined; };
const replay = argv.includes("--replay");
const PROMPTS = [SUGGESTED[1], SUGGESTED[2], SUGGESTED[3], "Add a contact form to every page"];
const sock = io(`http://127.0.0.1:${opt("port") ?? ENGINE_PORT}`);
const send = (c: GameCommand) => sock.emit(SOCKET.command, c);
const t0 = Date.now();
const ts = () => `${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s`;

let state: WorldState | null = null;
let lastSeq = 0, booted = false, idleSeen = false, fixesSent = false, stopSent = false, suggestions = 0;
let turn4Bricks = 0;
const events: EngineEvent[] = [];
const problems: string[] = [];
const sendPrompt = (i: number) => (i === 0 ? send({ type: "start", prompt: PROMPTS[0] }) : send({ type: "prompt", text: PROMPTS[i] }));

sock.on(SOCKET.snapshot, (s: WorldState) => { if (booted) return; booted = true; state = s; lastSeq = s.seq; send({ type: "reset" }); });
sock.on(SOCKET.event, (e: EngineEvent) => {
  if (!state || e.seq <= lastSeq) return;
  if (e.seq !== lastSeq + 1) problems.push(`gap #${e.seq} after #${lastSeq}`);
  lastSeq = e.seq; state = reduce(state, e);
  if (e.type === "session.reset") events.length = 0;
  events.push(e);
  const s = state, turns = s.turns.length;
  narrate(e, turns);

  if (e.type === "session.phase" && e.phase === "idle" && !idleSeen) { idleSeen = true; if (!replay) sendPrompt(0); }
  if (e.type === "prompt.suggested") { const i = suggestions++; if (e.text !== PROMPTS[i]) problems.push(`suggestion ${i + 1} mismatch`); if (replay) sendPrompt(i); }
  if (e.type === "session.phase" && e.phase === "contract") send({ type: "approve.plan" });
  if (e.type === "escalation.opened") send({ type: "escalation.choose", escalationId: e.escalationId, optionId: "narrow" });
  if (e.type === "tina.inspect.finished" && e.scope === "final" && turns === 1 && !fixesSent) {
    fixesSent = true;
    for (const f of s.findings) send({ type: "fix.apply", findingId: f.id, fixId: f.fixes[0].id });
  }
  if (e.type === "launch.unlocked" && (turns === 1 || turns === 3)) send({ type: "launch" });
  if (!replay && e.type === "report.ready" && turns === 1) sendPrompt(1);
  if (!replay && e.type === "launch.unlocked" && turns === 2) sendPrompt(2);
  if (!replay && e.type === "report.ready" && turns === 3) sendPrompt(3);
  if (e.type === "dog.brick.placed" && turns === 4 && ++turn4Bricks === 2 && !stopSent) { stopSent = true; console.log(`${ts()}  >>> Stop`); send({ type: "stop" }); }
  if (e.type === "session.phase" && e.phase === "ready" && turns === 4 && s.turns[3]?.summary) setTimeout(finish, 500);
});

function narrate(e: EngineEvent, turns: number) {
  const tag = `${ts()} t${turns}`;
  switch (e.type) {
    case "turn.started": console.log(`${tag} === TURN ${e.turnId}: ${e.prompt.slice(0, 90)}`); break;
    case "turn.finished": console.log(`${tag} === TURN ${e.turnId} RESULT: ${e.summary}`); break;
    case "fence.plan.proposed": console.log(`${tag} plan: ${e.segments.map((g) => g.id).join(", ")}`); break;
    case "fence.blocked": console.log(`${tag} ** fence.blocked ${JSON.stringify({ target: e.target, tool: e.tool, layer: e.layer, simulated: e.simulated, reason: e.reason })}`); break;
    case "escalation.opened": console.log(`${tag} ** escalation.opened source=${e.source} requested=${e.requested} files=${e.inspection.totalFiles}`); break;
    case "escalation.resolved": console.log(`${tag} ** escalation.resolved ${e.choice}: ${e.summary}`); break;
    case "dog.brick.placed": console.log(`${tag} brick #${e.bricks} ${e.op} ${e.file}`); break;
    case "speech": if (e.actor === "dog") console.log(`${tag} dog: "${e.text}"`); break;
    case "engine.error": console.log(`${tag} !! engine.error ${e.message}`); break;
    case "raw.log": if (e.channel === "sdk" && /^(result|Stop|interrupt|-> Claude)/.test(e.text)) console.log(`${tag} [sdk] ${e.text.slice(0, 160)}`);
      if (e.channel === "config" && e.text.startsWith("workspace ")) console.log(`${tag} [config] ${e.text.slice(0, 200)}`); break;
    case "session.phase": console.log(`${tag} phase ${e.phase}`); break;
  }
}

function finish() {
  const s = state!;
  const blocked = events.filter((e): e is Extract<EngineEvent, { type: "fence.blocked" }> => e.type === "fence.blocked");
  const escs = events.filter((e): e is Extract<EngineEvent, { type: "escalation.opened" }> => e.type === "escalation.opened");
  const summary = {
    phase: s.phase, launchUnlocked: s.launchUnlocked, bricks: s.bricks,
    turns: s.turns.map((t) => ({ id: t.id, summary: t.summary })),
    segments: s.segments.map((g) => `${g.id}=${g.status}`),
    blocked: blocked.map((b) => `${b.layer}:${b.target}`),
    escalations: escs.map((e) => `${e.source}:${e.requested}`),
    errors: events.filter((e) => e.type === "engine.error").length,
  };
  const workspace = s.rawLog.map((l) => l.match(/^\[config\] workspace (\S+);/)?.[1]).find(Boolean);
  const cost = [...s.rawLog].reverse().map((l) => l.match(/session \$([\d.]+)/)?.[1]).find(Boolean);
  const checks: [string, boolean][] = [
    ["4 turns with results", summary.turns.length === 4 && summary.turns.every((t) => t.summary)],
    ["turn 2 prompt-sourced card", escs.some((e) => e.source === "prompt" && e.requested.includes("Rivera-HR"))],
    ["turn 3 straight through (no card)", !events.some((e) => e.type === "escalation.opened" && s.turns.length >= 3 && events.indexOf(e) > events.findIndex((x) => x.type === "turn.started" && x.turnId === 3) && events.indexOf(e) < events.findIndex((x) => x.type === "turn.finished" && x.turnId === 3))],
    ["turn 4 stopped by you", s.turns[3]?.summary === "Stopped by you"],
    ["back to ready", s.phase === "ready"],
    ["no engine errors / gaps", summary.errors === 0 && problems.length === 0],
    [replay ? "4 suggestions" : "bricks accumulate", replay ? suggestions === 4 : s.bricks > 5],
  ];
  if (replay && opt("compare")) {
    const want = JSON.parse(fs.readFileSync(opt("compare")!, "utf8"));
    checks.push(["replay ends in the live run's state", JSON.stringify(want) === JSON.stringify(summary)]);
    if (JSON.stringify(want) !== JSON.stringify(summary)) console.log("want:", JSON.stringify(want), "\ngot: ", JSON.stringify(summary));
  }
  if (!replay && opt("save")) fs.writeFileSync(opt("save")!, JSON.stringify(summary, null, 2));
  console.log("\n==================== LIVE RESULT ====================");
  for (const [n, ok] of checks) console.log(`${ok ? "ok  " : "FAIL"} ${n}`);
  for (const t of summary.turns) console.log(`turn ${t.id}: ${t.summary}`);
  console.log(`bricks=${s.bricks} segments: ${summary.segments.join(", ")}`);
  console.log(`blocked: ${summary.blocked.join(" | ") || "none"}`);
  console.log(`escalations: ${summary.escalations.join(" | ") || "none"}`);
  if (!replay) console.log(`workspace: ${workspace}\nsession cost (SDK estimate): $${cost ?? "?"}`);
  if (problems.length) console.log(problems.join("\n"));
  const ok = checks.every(([, v]) => v);
  console.log(`LIVE ${replay ? "REPLAY" : "RUN"} -> ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

setTimeout(() => { console.log(`TIMEOUT phase=${state?.phase} turns=${state?.turns.map((t) => `${t.id}:${t.summary ?? "-"}`).join(",")}`); process.exit(1); }, Number(opt("timeout") ?? 1500) * 1000);
