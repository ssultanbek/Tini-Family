// Turn-loop test client. Run against the engine in standin mode, then again against
// that run's recording in replay mode:
//   npx tsx test/loop.ts <narrow|all|deny> [--replay] [--port 4000]
// Covers: turn 1 with the agent escalation (answered only once the dog is waiting, to
// exercise the turn-complete rule), adjust + approve, both fixes, launch; turn 2 with
// ~/Documents/Rivera-HR (prompt-sourced escalation); turn 3 plain + relaunch (relock
// and unlock); turn 4 stopped mid-turn; invalid commands ignored; a reconnect mid-turn
// gets a snapshot equal to the live state. In replay, prompts are sent only when
// prompt.suggested arrives, and each suggestion must match the recorded prompt.
import { io, type Socket } from "socket.io-client";
import { ENGINE_PORT, SOCKET, type EngineEvent, type GameCommand, type WorldState } from "../../shared/events.ts";
import { reduce } from "../../shared/reducer.ts";
import { SUGGESTED } from "../../mock/scenario.ts";

const choice = (process.argv.find((a) => ["narrow", "all", "deny"].includes(a)) ?? "narrow") as "narrow" | "all" | "deny";
const replay = process.argv.includes("--replay");
const pi = process.argv.indexOf("--port");
const url = `http://127.0.0.1:${pi > 0 ? process.argv[pi + 1] : ENGINE_PORT}`;
const PROMPTS = [SUGGESTED[1], SUGGESTED[2], SUGGESTED[3], "Add a contact form to every page"];

const sock = io(url);
const send = (c: GameCommand) => sock.emit(SOCKET.command, c);
let state: WorldState | null = null;
let lastSeq = 0;
let booted = false;
const history = new Map<number, string>();
const seen: EngineEvent[] = [];
const problems: string[] = [];
let invalidSent = 0;
const invalid = (c: GameCommand) => { invalidSent++; send(c); };

const flags = { idle: false, contracts: 0, agentChosen: false, reconnect: "not run", stopSent: false, suggestions: 0, fixesSent: false };
let agentEsc: Extract<EngineEvent, { type: "escalation.opened" }> | null = null;

function sendPrompt(i: number) {
  if (i === 0) send({ type: "start", prompt: PROMPTS[0] });
  else send({ type: "prompt", text: PROMPTS[i] });
}

sock.on(SOCKET.snapshot, (s: WorldState) => {
  if (booted) return;
  booted = true; state = s; lastSeq = s.seq; history.set(s.seq, JSON.stringify(s));
  send({ type: "reset" });
});

sock.on(SOCKET.event, (e: EngineEvent) => {
  if (!state) return;
  if (e.seq <= lastSeq) return;
  if (e.seq !== lastSeq + 1) problems.push(`gap: #${e.seq} after #${lastSeq}`);
  lastSeq = e.seq; state = reduce(state, e); history.set(e.seq, JSON.stringify(state));
  if (e.type === "session.reset") { seen.length = 0; }
  seen.push(e);
  const s = state;
  const turns = s.turns.length;

  if (e.type === "session.phase" && e.phase === "idle" && !flags.idle) {
    flags.idle = true;
    // Batch A: nothing but start is valid in idle.
    invalid({ type: "launch" }); invalid({ type: "approve.plan" }); invalid({ type: "prompt", text: "too early" });
    invalid({ type: "stop" }); invalid({ type: "fix.apply", findingId: "f-key", fixId: "blur" });
    invalid({ type: "escalation.choose", escalationId: "esc-1", optionId: "narrow" });
    if (!replay) sendPrompt(0);
  }
  if (e.type === "prompt.suggested") {
    const i = flags.suggestions++;
    const okPhase = i === 0 ? s.phase === "idle" : s.phase === "ready" || s.phase === "launched";
    if (e.text !== PROMPTS[i]) problems.push(`suggestion ${i + 1} text mismatch: "${e.text.slice(0, 40)}"`);
    if (!okPhase) problems.push(`suggestion ${i + 1} arrived in phase ${s.phase}`);
    if (replay) sendPrompt(i);
  }
  if (e.type === "session.phase" && e.phase === "contract") {
    if (++flags.contracts === 1) send({ type: "adjust.plan", text: "Also show our phone number on every page" });
    else send({ type: "approve.plan" });
  }
  if (e.type === "escalation.opened" && e.source === "agent") {
    agentEsc = e;
    // Batch B while Claude is building with a card open.
    invalid({ type: "escalation.choose", escalationId: "esc-999", optionId: "narrow" });
    invalid({ type: "start", prompt: "again" }); invalid({ type: "launch" }); invalid({ type: "prompt", text: "mid-turn" }); invalid({ type: "approve.plan" });
    reconnectCheck(e.escalationId);
  }
  // Answer the agent's card only once Claude has finished and is waiting on it.
  if (e.type === "dog.state" && e.state === "waiting" && agentEsc && !flags.agentChosen && s.openEscalation?.escalationId === agentEsc.escalationId) {
    flags.agentChosen = true;
    send({ type: "escalation.choose", escalationId: agentEsc.escalationId, optionId: choice });
  }
  if (e.type === "escalation.opened" && e.source === "prompt") send({ type: "escalation.choose", escalationId: e.escalationId, optionId: choice });
  if (e.type === "tina.inspect.finished" && e.scope === "final" && turns === 1 && !flags.fixesSent) {
    flags.fixesSent = true;
    for (const f of s.findings) send({ type: "fix.apply", findingId: f.id, fixId: f.fixes[0].id });
  }
  if (e.type === "launch.unlocked" && (turns === 1 || turns === 3)) send({ type: "launch" });
  if (!replay && e.type === "report.ready" && turns === 1) sendPrompt(1);
  if (!replay && e.type === "launch.unlocked" && turns === 2) sendPrompt(2);
  if (!replay && e.type === "report.ready" && turns === 3) sendPrompt(3);
  if (e.type === "dog.brick.placed" && turns === 4 && !flags.stopSent) { flags.stopSent = true; send({ type: "stop" }); }
  if (e.type === "launch.unlocked" && turns === 4) setTimeout(finish, 300);
});

function reconnectCheck(escalationId: string) {
  const second: Socket = io(url, { forceNew: true });
  second.on(SOCKET.snapshot, (snap: WorldState) => {
    const compare = () => {
      if (lastSeq < snap.seq) { setTimeout(compare, 20); return; }
      const mine = history.get(snap.seq);
      const same = mine === JSON.stringify(snap);
      const mid = snap.phase === "building" && snap.openEscalation?.escalationId === escalationId;
      flags.reconnect = same && mid ? `snapshot #${snap.seq} matches live state (phase=${snap.phase}, card ${escalationId} open)` : "MISMATCH";
      if (!same || !mid) problems.push(`reconnect snapshot mismatch (same=${same} mid=${mid})`);
      second.close();
    };
    compare();
  });
}

function finish() {
  const s = state!;
  const count = (t: string) => seen.filter((e) => e.type === t).length;
  const ev = <T extends EngineEvent["type"]>(t: T) => seen.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === t);
  const t1done = ev("turn.finished").find((e) => e.turnId === 1)!;
  const agentResolved = ev("escalation.resolved").find((e) => e.escalationId === agentEsc?.escalationId);
  const ignored = s.rawLog.filter((l) => l.startsWith("[engine] ignored")).length;
  const expectSegs = choice === "deny" ? 5 : 7;
  const expectT1 = choice === "deny" ? "Built a 3-page site: home, services, gallery." : "Added the approved job-site photos to the gallery.";
  const checks: [string, boolean][] = [
    ["4 turns, all with results", s.turns.length === 4 && s.turns.every((t) => t.summary)],
    ["turn 1 waited for the card + follow-up", s.turns[0].summary === expectT1 && !!agentResolved && t1done.seq > agentResolved.seq],
    ["turn 4 stopped by you", s.turns[3].summary === "Stopped by you"],
    ["back to ready, launch unlocked", s.phase === "ready" && s.launchUnlocked],
    ["escalations agent+prompt", ev("escalation.opened").map((e) => e.source).join(",") === "agent,prompt"],
    ["adjust re-planned", count("fence.plan.proposed") === 2],
    ["2 reds fixed", count("segment.red") === 2 && count("fix.applied") === 2 && s.findings.length === 0],
    [`segments all green (${expectSegs})`, s.segments.length === expectSegs && s.segments.every((g) => g.status === "green")],
    ["launches 2, locks 3, unlocks 4", count("launch.done") === 2 && count("launch.locked") === 3 && count("launch.unlocked") === 4],
    ["attack blocked (simulated)", s.blocked.filter((b) => b.simulated).length === 1],
    [`invalid commands ignored (${invalidSent})`, ignored === invalidSent && count("engine.error") === 0],
    ["reconnect snapshot", flags.reconnect.startsWith("snapshot")],
    [replay ? "prompt.suggested before all 4 prompt gates" : "no suggestions in live", replay ? flags.suggestions === 4 : flags.suggestions === 0],
    ["no seq gaps / problems", problems.length === 0],
  ];
  for (const [name, ok] of checks) console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  console.log(`turns: ${s.turns.map((t) => `${t.id}="${t.summary}"`).join(" | ")}`);
  console.log(`segments: ${s.segments.map((g) => g.id + "=" + g.status).join(", ")}`);
  console.log(`reconnect: ${flags.reconnect}; ignored=${ignored}/${invalidSent}; bricks=${s.bricks}; events=${seen.length}`);
  if (problems.length) console.log(problems.join("\n"));
  const ok = checks.every(([, v]) => v);
  console.log(`LOOP ${replay ? "REPLAY" : "STANDIN"} choice=${choice} -> ${ok ? "PASS" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
}

setTimeout(() => {
  console.log(`TIMEOUT phase=${state?.phase} turns=${state?.turns.map((t) => t.id + ":" + (t.summary ?? "-")).join(",")} open=${state?.openEscalation?.escalationId ?? "-"} problems=${problems.join("; ")}`);
  process.exit(1);
}, 90000);
