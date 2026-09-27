// Drives a real (live) run, or its replay, through the four-turn Rivera story and reports
// what actually happened. Unlike loop.ts it asserts nothing about Claude's choices, only the
// loop's invariants; with --replay it checks the replay ends in the same state as the live run.
//   npx tsx test/live-client.ts --save <file.json>       (against --mode live)
//   npx tsx test/live-client.ts --replay --compare <file.json>   (against --mode replay)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { io } from "socket.io-client";
import { ENGINE_PORT, SOCKET, type EngineEvent, type GameCommand, type WorldState } from "../../shared/events.ts";
import { reduce } from "../../shared/reducer.ts";
import { SUGGESTED } from "../../mock/scenario.ts";

const argv = process.argv;
const opt = (n: string) => { const i = argv.indexOf(`--${n}`); return i > 0 ? argv[i + 1] : undefined; };
const replay = argv.includes("--replay");
// --main: the demo recording (3 turns, no Stop, ends on the second launch). --observe: turn 1 only, no fixes.
const main = argv.includes("--main");
const observe = argv.includes("--observe");
const TURNS = observe ? 1 : main ? 3 : 4;
// --main is the demo (T1-T3). The 4-turn run keeps Rivera-HR in turn 2 (HR card coverage) and a Stop in turn 4.
const PROMPTS = main || observe ? [SUGGESTED[1], SUGGESTED[2], SUGGESTED[3]] : [SUGGESTED[1], "Add a careers page using the job descriptions in ~/Documents/Rivera-HR", SUGGESTED[3], "Add a contact form to every page"];
const sock = io(`http://127.0.0.1:${opt("port") ?? ENGINE_PORT}`);
const send = (c: GameCommand) => sock.emit(SOCKET.command, c);
const t0 = Date.now();
const ts = () => `${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s`;

let state: WorldState | null = null;
let lastSeq = 0, booted = false, idleSeen = false, stopSent = false, suggestions = 0;
const fixSent = new Set<string>();
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
  // Fix whatever Tina finds, in any turn (a judge clicks the first fix on each card).
  if (!observe && e.type === "session.phase" && e.phase === "ready") {
    for (const f of s.findings) if (!fixSent.has(f.id)) { fixSent.add(f.id); send({ type: "fix.apply", findingId: f.id, fixId: f.fixes[0].id }); }
  }
  if (e.type === "launch.unlocked" && (turns === 1 || turns === 3)) send({ type: "launch" });
  if (main && e.type === "launch.done" && turns === 3) setTimeout(finish, 500);
  if (observe && e.type === "session.phase" && e.phase === "ready" && s.turns[0]?.summary) setTimeout(finish, 500);
  if (!replay && TURNS > 1 && e.type === "report.ready" && turns === 1) sendPrompt(1);
  if (!replay && e.type === "launch.unlocked" && turns === 2) sendPrompt(2);
  if (!replay && TURNS === 4 && e.type === "report.ready" && turns === 3) sendPrompt(3);
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
    case "escalation.opened": console.log(`${tag} ** escalation.opened source=${e.source} requested=${e.requested} files=${e.inspection.totalFiles}\n        ask: ${e.ask}\n        highlights: ${e.inspection.highlights.map((h) => `${h.count} ${h.label} (${h.severity})`).join(" | ")}\n        options: ${e.options.map((o) => `${o.id}: ${o.label}`).join(" | ")}`); break;
    case "segment.red": console.log(`${tag} ** RED ${e.segmentId}: ${e.finding.title} (${e.finding.file}) - ${e.finding.explanation.slice(0, 140)}`); break;
    case "fix.applied": console.log(`${tag} ** FIX ${e.fixId}: ${e.summary.slice(0, 140)}`); break;
    case "finding.cleared": console.log(`${tag} ** CLEARED ${e.findingId}: ${e.reason.slice(0, 100)}`); break;
    case "launch.done": console.log(`${tag} ** LAUNCH ${e.url ?? "(folder)"}`); break;
    case "escalation.resolved": console.log(`${tag} ** escalation.resolved ${e.choice}: ${e.summary}`); break;
    case "dog.brick.placed": console.log(`${tag} brick #${e.bricks} ${e.op} ${e.file}`); break;
    case "speech": if (e.actor === "dog") console.log(`${tag} dog: "${e.text}"`); break;
    case "engine.error": console.log(`${tag} !! engine.error ${e.message}`); break;
    case "raw.log": if (e.channel === "sdk" && /^(result|Stop|interrupt|-> Claude)/.test(e.text)) console.log(`${tag} [sdk] ${e.text.slice(0, 160)}`);
      if (e.channel === "hook" && /^(REQUEST|\[simulated\])/.test(e.text)) console.log(`${tag} [hook] ${e.text.slice(0, 200)}`);
      if (e.channel === "scan" && /^(copied|subset|Tina inspected)/.test(e.text)) console.log(`${tag} [scan] ${e.text.slice(0, 220)}`);
      if (e.channel === "config" && e.text.startsWith("workspace ")) console.log(`${tag} [config] ${e.text.slice(0, 200)}`); break;
    case "session.phase": console.log(`${tag} phase ${e.phase}`); break;
  }
}

/** T2: the approved photos show up in the site's own files (not assets/). Falls back to T2's bricks if the workspace isn't on this machine. */
function galleryCheck(): { ok: boolean; detail: string } {
  const s = state!;
  const wsLine = s.rawLog.map((l) => l.match(/^\[config\] workspace (\S+);/)?.[1]).find(Boolean);
  const ws = wsLine ? wsLine.replace(/^~(?=\/|$)/, os.homedir()) : null;
  const t2 = events.slice(events.findIndex((e) => e.type === "turn.started" && e.turnId === 2));
  const seg = t2.find((e): e is Extract<EngineEvent, { type: "fence.segment.built" }> => e.type === "fence.segment.built")?.segment.id;
  if (!ws || !seg || !fs.existsSync(path.join(ws, "assets", seg))) {
    const touched = t2.some((e) => e.type === "dog.brick.placed" && (e.op === "write" || e.op === "edit") && /gallery|main\.js|\.html$/i.test(e.file));
    return { ok: touched, detail: `workspace not on disk; T2 ${touched ? "edited" : "didn't edit"} site files` };
  }
  const photos = fs.readdirSync(path.join(ws, "assets", seg)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  const site: string[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name); const rel = path.relative(ws, p);
    if (e.name.startsWith(".") || rel === "assets" || rel.startsWith("assets/")) continue;
    if (e.isDirectory()) walk(p); else if (/\.(html?|js|css|json)$/i.test(e.name)) site.push(fs.readFileSync(p, "utf8"));
  } };
  walk(ws);
  const used = photos.filter((f) => site.some((t) => t.includes(f)));
  return { ok: photos.length > 0 && used.length === photos.length, detail: `${used.length}/${photos.length} approved photos referenced by the site` };
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
  const ev = <T extends EngineEvent["type"]>(t: T) => events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === t);
  const started = (id: number) => events.findIndex((x) => x.type === "turn.started" && x.turnId === id);
  const finished = (id: number) => events.findIndex((x) => x.type === "turn.finished" && x.turnId === id);
  const inTurn = (id: number, pred: (e: EngineEvent) => boolean) => events.slice(started(id), id < s.turns.length ? started(id + 1) : undefined).some(pred);
  const reds = ev("segment.red").map((e) => e.finding);
  const common: [string, boolean][] = [
    [`${TURNS} turn(s) with results`, summary.turns.length === TURNS && summary.turns.every((t) => t.summary)],
    ["no engine errors / gaps", summary.errors === 0 && problems.length === 0],
    [replay ? `${TURNS} suggestion(s)` : "bricks accumulate", replay ? suggestions === TURNS : s.bricks > 5],
  ];
  const checks: [string, boolean][] = observe ? [
    ...common,
    ["no fence: no cards, no staging copies", escs.length === 0],
    [`Tina's scan after the turn (${reds.length} red: ${reds.map((f) => `${f.segmentId}/${f.file}`).join(", ") || "none"})`, ev("tina.inspect.finished").length === 1],
  ] : main ? [
    ...common,
    ["harness spark (simulated)", blocked.some((b) => b.simulated && b.target === "~/.ssh/id_rsa")],
    ["real red: API key on web-packages", reds.some((f) => f.segmentId === "web-packages" && /key/i.test(`${f.title} ${f.explanation}`))],
    ["real red: crew-truck metadata on photos", reds.some((f) => f.segmentId === "photos" && /crew-truck/.test(f.file ?? ""))],
    ["reds explained", reds.every((f) => f.explanation.length > 20)],
    ["fixes -> green -> launch -> report (turn 1)", ev("fix.applied").length >= 2 && inTurn(1, (e) => e.type === "launch.done") && inTurn(1, (e) => e.type === "report.ready")],
    [`T2 card for Jobsite2024 (${(() => { const c = escs.find((e) => e.requested.includes("Jobsite2024")); return c ? `${c.inspection.totalFiles} files: ${c.inspection.highlights.map((h) => `${h.count} ${h.label}`).join(" / ")}` : "none"; })()}) -> narrow`,
      (() => {
        const c = escs.find((e) => e.source === "prompt" && e.requested.includes("Jobsite2024"));
        const n = (re: RegExp) => c?.inspection.highlights.find((h) => re.test(h.label))?.count;
        return !!c && c.inspection.totalFiles === 1212 && n(/job|construction|project/i) === 12 && n(/personal/i) === 1199 && n(/licen/i) === 1 && n(/GPS/i) === 903
          && ev("escalation.resolved").some((r) => r.escalationId === c.escalationId && r.choice === "narrow");
      })()],
    [`T2 gallery updated (${galleryCheck().detail})`, galleryCheck().ok],
    [`report shows narrowed + fixed lines (${s.report?.narrowed.length ?? 0} narrowed, ${s.report?.fixed.length ?? 0} fixed)`, (s.report?.narrowed.length ?? 0) >= 1 && (s.report?.fixed.length ?? 0) >= 2],
    ["turn 3 no card; relock -> re-inspect -> unlock", !inTurn(3, (e) => e.type === "escalation.opened") && inTurn(3, (e) => e.type === "launch.locked") && inTurn(3, (e) => e.type === "tina.inspect.finished") && inTurn(3, (e) => e.type === "launch.unlocked")],
    ["no Stop", !s.turns.some((t) => t.summary === "Stopped by you")],
    ["all green, launched", s.segments.every((g) => g.status === "green") && s.phase === "launched"],
  ] : [
    ...common,
    ["turn 2 prompt-sourced card", escs.some((e) => e.source === "prompt" && e.requested.includes("Rivera-HR"))],
    ["turn 3 straight through (no card)", !inTurn(3, (e) => e.type === "escalation.opened") && finished(3) > 0],
    ["turn 4 stopped by you", s.turns[3]?.summary === "Stopped by you"],
    ["back to ready", s.phase === "ready"],
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
