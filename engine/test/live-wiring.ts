// Offline check of the live crew's wiring: real Tini (plan/stage/access), real Tina
// (runInspection, applyFix in crew mode), real launch + buildReport, through the real
// Project. Only Claude is replaced, by a scripted turn that does what the demo expects:
// puts the office Maps key into js/main.js and shows crew-truck.jpg. No network, no cost
// (AI ladder has no providers: every AI step uses its code fallback).
//   npx tsx test/live-wiring.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { EngineEvent } from "../../shared/events.ts";
import { createAi } from "../src/ai.ts";
import type { Crew, CrewCtx } from "../src/crew.ts";
import { stopSite } from "../src/launcher.ts";
import { liveCrew } from "../src/live.ts";
import { Hub, Project } from "../src/project.ts";

process.env.TINI_PROJECTS_DIR = fs.mkdtempSync(path.join(os.homedir(), "tini-projects-wiring-"));
process.env.TINI_AI_CACHE = "off";
const ai = createAi({ gemini: null, claude: null, cacheDir: null });
const hub = new Hub(null);
const events: EngineEvent[] = [];
hub.on((e) => events.push(e));

const workspace = () => hub.state.rawLog.map((l) => l.match(/^\[config\] workspace (\S+);/)?.[1]).find(Boolean)!;
const scripted = async (ctx: CrewCtx, _msg: string, info: { turnId: number }) => {
  const ws = workspace();
  const brick = (op: "read" | "write" | "edit", file: string) => ctx.emit({ actor: "dog", type: "dog.brick.placed", op, file, bricks: ctx.state().bricks + 1 });
  if (info.turnId === 1) {
    const map = fs.readFileSync(path.join(ws, "assets/about/office-map.md"), "utf8");
    const key = map.match(/AIza[0-9A-Za-z_-]{20,}/)?.[0] ?? "";
    fs.mkdirSync(path.join(ws, "js"), { recursive: true });
    fs.writeFileSync(path.join(ws, "js/main.js"), `const MAPS_KEY = "${key}";\nconsole.log("map", MAPS_KEY);\n`);
    fs.writeFileSync(path.join(ws, "index.html"), `<!doctype html><h1>Rivera Construction</h1><img src="assets/photos/crew-truck.jpg"><img src="assets/photos/framing-01.jpg"><script src="js/main.js"></script>\n`);
    brick("read", "assets/about/office-map.md"); brick("write", "js/main.js"); brick("write", "index.html");
    return "Built the homepage with a map and two photos.";
  }
  fs.writeFileSync(path.join(ws, "styles.css"), "header { background: #0b0e13; }\n");
  brick("write", "styles.css");
  return "Darkened the header.";
};
const crew: Crew = { ...liveCrew(), runTurn: scripted };
const project = new Project(hub, crew, ai);
project.boot();

const wait = async (pred: () => boolean, what: string, ms = 60000) => {
  const t = Date.now();
  while (!pred()) { if (Date.now() - t > ms) throw new Error(`timeout waiting for ${what} (phase ${hub.state.phase})`); await new Promise((r) => setTimeout(r, 20)); }
};
const checks: [string, boolean][] = [];
try {
  project.command({ type: "start", prompt: "Build a modern, serious-looking website for Rivera Construction with a gallery of this year's projects. Use the photos in ~/Clients/Rivera/Photos and the company info in ~/Clients/Rivera/About and ~/Clients/Rivera/Services." });
  await wait(() => hub.state.phase === "contract", "contract");
  project.command({ type: "approve.plan" });
  await wait(() => hub.state.phase === "ready" && hub.state.turns[0]?.summary !== undefined, "turn 1 inspected");
  const reds = hub.state.findings.map((f) => `${f.segmentId}:${f.title}`);
  checks.push([`turn 1: real reds on web-packages (key) and photos (crew-truck) -> ${reds.join(" | ")}`,
    hub.state.findings.some((f) => f.segmentId === "web-packages" && /key/i.test(f.title + f.explanation)) &&
    hub.state.findings.some((f) => f.segmentId === "photos" && /crew-truck/.test(f.file ?? "")) && !hub.state.launchUnlocked]);
  checks.push(["explanations present", hub.state.findings.every((f) => f.explanation.length > 20)]);
  for (const f of [...hub.state.findings]) project.command({ type: "fix.apply", findingId: f.id, fixId: f.fixes[0].id });
  await wait(() => hub.state.launchUnlocked, "unlock after fixes");
  checks.push(["both fixes -> all green -> unlocked", hub.state.findings.length === 0 && hub.state.segments.every((g) => g.status === "green")]);
  checks.push(["key gone from the site", !/AIza/.test(fs.readFileSync(path.join(workspace(), "js/main.js"), "utf8"))]);
  project.command({ type: "launch" });
  await wait(() => hub.state.phase === "launched" && !!hub.state.report, "launch + report");
  const done = events.find((e): e is Extract<EngineEvent, { type: "launch.done" }> => e.type === "launch.done");
  const page = done?.url ? await (await fetch(done.url)).text() : "";
  checks.push([`launch served the site at ${done?.url}`, page.includes("Rivera Construction")]);
  const r = hub.state.report!;
  checks.push([`report: ${r.allowed.length} allowed, ${r.blocked.length} blocked, ${r.narrowed.length} narrowed, ${r.fixed.length} fixed, data leaves to ${r.dataLeavesTo.join(",") || "nothing"}`, r.fixed.length === 2 && r.allowed.length > 0]);
  project.command({ type: "prompt", text: "Make the header darker" });
  await wait(() => hub.state.turns.length === 2 && hub.state.phase === "ready" && hub.state.launchUnlocked, "turn 2 unlocked");
  const t2 = events.slice(events.findIndex((e) => e.type === "turn.started" && e.turnId === 2));
  checks.push(["turn 2: relock -> re-inspect -> unlock, no card", t2.some((e) => e.type === "launch.locked") && t2.some((e) => e.type === "tina.inspect.finished") && !t2.some((e) => e.type === "escalation.opened")]);
  checks.push(["no engine errors", !events.some((e) => e.type === "engine.error")]);
} catch (e) {
  checks.push([`flow: ${(e as Error).message}`, false]);
  for (const e2 of events.filter((x) => x.type === "engine.error")) console.log("engine.error:", (e2 as { message: string }).message);
}
await stopSite();
for (const [n, ok] of checks) console.log(`${ok ? "ok  " : "FAIL"} ${n}`);
fs.rmSync(process.env.TINI_PROJECTS_DIR!, { recursive: true, force: true });
const ok = checks.length > 0 && checks.every(([, v]) => v);
console.log(ok ? "LIVE WIRING PASS" : "LIVE WIRING FAIL");
process.exit(ok ? 0 : 1);
