// Edge cases of the phase machine, in-process (no server): crew errors land in a safe
// phase with engine.error, Stop during setup goes back to idle, a failed inspection
// keeps launch locked.  npx tsx test/project.edge.ts
import type { GameCommand, Phase } from "../../shared/events.ts";
import { createAi } from "../src/ai.ts";
import type { Crew } from "../src/crew.ts";
import { Hub, Project } from "../src/project.ts";
import { standinCrew } from "../src/standins.ts";

const ai = createAi({ gemini: null, claude: null, cacheDir: null });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const boom = () => Promise.reject(new Error("boom"));

async function scenario(name: string, patch: Partial<Crew>, drive: (p: Project, hub: Hub) => Promise<void>, expect: (hub: Hub) => boolean) {
  const hub = new Hub(null);
  const p = new Project(hub, { ...standinCrew(100), ...patch }, ai);
  p.boot();
  await drive(p, hub);
  const ok = expect(hub);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: phase=${hub.state.phase} turns=${hub.state.turns.map((t) => `${t.id}:${t.summary ?? "-"}`).join(",") || "-"} unlocked=${hub.state.launchUnlocked}`);
  return ok;
}
const waitPhase = async (hub: Hub, phase: Phase, ms = 5000) => { const t = Date.now(); while (hub.state.phase !== phase && Date.now() - t < ms) await sleep(10); };
const cmd = (p: Project, c: GameCommand) => p.command(c);
let lastError = "";
const withErrors = (hub: Hub) => { hub.on((e) => { if (e.type === "engine.error") lastError = e.message; }); return hub; };

const results = [
  await scenario("plan throws -> engine.error, idle", { plan: boom }, async (p, hub) => {
    withErrors(hub); lastError = ""; cmd(p, { type: "start", prompt: "x" }); await sleep(100);
  }, (hub) => hub.state.phase === "idle" && lastError.startsWith("Setup failed")),

  await scenario("stop during turn-1 planning -> idle", {}, async (p, hub) => {
    cmd(p, { type: "start", prompt: "x" }); await sleep(2); cmd(p, { type: "stop" }); await sleep(100); void hub;
  }, (hub) => hub.state.phase === "idle" && hub.state.turns.length === 0),

  await scenario("runTurn throws -> engine.error, inspected, ready", { runTurn: boom }, async (p, hub) => {
    withErrors(hub); lastError = "";
    cmd(p, { type: "start", prompt: "x" }); await waitPhase(hub, "contract"); cmd(p, { type: "approve.plan" }); await waitPhase(hub, "ready");
  }, (hub) => hub.state.phase === "ready" && hub.state.turns[0]?.summary === "Stopped: something went wrong" && lastError.startsWith("Turn 1 failed")),

  await scenario("inspect throws -> engine.error, ready, launch locked", { inspect: boom, runTurn: async () => "done" }, async (p, hub) => {
    withErrors(hub); lastError = "";
    cmd(p, { type: "start", prompt: "x" }); await waitPhase(hub, "contract"); cmd(p, { type: "approve.plan" });
    await waitPhase(hub, "ready", 10000);
  }, (hub) => hub.state.phase === "ready" && !hub.state.launchUnlocked && lastError.startsWith("Inspection failed")),

  await scenario("reset mid-turn -> clean idle, stale flow silent", {}, async (p, hub) => {
    cmd(p, { type: "start", prompt: "x" }); await waitPhase(hub, "contract"); cmd(p, { type: "approve.plan" }); await waitPhase(hub, "building");
    cmd(p, { type: "reset" }); await sleep(400);
  }, (hub) => hub.state.phase === "idle" && hub.state.segments.length === 0 && hub.state.bricks === 0),
];
const ok = results.every(Boolean);
console.log(ok ? "EDGE PASS" : "EDGE FAIL");
process.exit(ok ? 0 : 1);
