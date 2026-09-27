// Stages 6+7: Tina's per-turn inspection, fixes and the report, on a fixture site built
// from the real Rivera staging. The demo Maps key is read from the staged copy at runtime
// (never written in this file). Workspaces go to a temp TINI_PROJECTS_DIR.
import { spawnSync } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
process.env.TINI_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tini-tina-test-"));
process.env.TINI_AI_CACHE = "off";
import { createAiFromEnv, type Ask, type AskArgs, type AskResult } from "../src/ai.ts";
import type { CrewCtx, Ev } from "../src/crew.ts";
import type { EngineEvent, WorldState } from "../../shared/events.ts";
import { initialState, reduce } from "../../shared/reducer.ts";
import { planFence, stageFence, type Staged } from "../src/tini/index.ts";
import { runInspection, toFinding } from "../src/tina/findings.ts";
import { scanWorkspace } from "../src/tina/scan.ts";
import { applyFix } from "../src/tina/fixes.ts";
import { resetExplanations } from "../src/tina/explain.ts";
import { identifyingTags } from "../src/tina/exif.ts";
import { buildReport, eventsFromRecording } from "../src/report.ts";
import { exiftool } from "exiftool-vendored";

let fail = 0, pass = 0;
const ok = (cond: unknown, name: string, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};
const H = os.homedir();
const RIVERA = "Build a modern, serious-looking website for Rivera Construction. Use the photos in ~/Clients/Rivera/Photos and the company info in ~/Clients/Rivera/About and ~/Clients/Rivera/Services.";
const deadAi = createAiFromEnv(undefined, process.env, "gemini=down,claude=down");
const realAi = createAiFromEnv((l) => console.log(`        ai: ${l.slice(0, 140)}`));

// --- a project whose state is maintained by the real reducer -------------------------
let state: WorldState = initialState();
const events: EngineEvent[] = [];
let seq = 0;
const emit = (ev: Ev) => { const e = { ...ev, seq: ++seq, ts: Date.now() } as EngineEvent; events.push(e); state = reduce(state, e); };
const ctx = (ai: Ask): Pick<CrewCtx, "emit" | "log" | "ai" | "state"> => ({
  emit, ai, state: () => state,
  log: (channel, text) => emit({ actor: "system", type: "raw.log", channel, text }),
});
const since = (n: number) => events.slice(n);
const reds = () => state.segments.filter((s) => s.status === "red").map((s) => s.id).sort().join(",");

console.log("fixture: stage the Rivera fence, then write a small site into it");
emit({ actor: "system", type: "turn.started", turnId: 1, prompt: RIVERA });
const plan = await planFence(RIVERA, deadAi);
emit({ actor: "tini", type: "fence.plan.proposed", segments: plan.segments, contract: plan.contract });
emit({ actor: "system", type: "fence.plan.approved" });
const staged: Staged = await stageFence(plan, emit);
const ws = staged.workspace;
const w = (rel: string, body: string) => { fs.mkdirSync(path.dirname(path.join(ws, rel)), { recursive: true }); fs.writeFileSync(path.join(ws, rel), body); };
const KEY = fs.readFileSync(path.join(ws, "assets/about/office-map.md"), "utf8").match(/AIza[0-9A-Za-z_-]{35}/)![0];
w("index.html", `<!doctype html><html><head><title>Rivera Construction</title><link rel="stylesheet" href="css/styles.css"></head>
<body><header><img class="hero" src="assets/photos/crew-truck.jpg" alt="Our crew"></header>
<section id="contact"><h2>Visit us</h2><div id="map" class="map"></div></section>
<script src="js/main.js"></script></body></html>`);
w("about.html", `<!doctype html><html><head><title>About Rivera Construction</title><link rel="stylesheet" href="css/styles.css"></head>
<body><h1>Family-run since 1998</h1><p>Call (305) 555-0142 or email office@riveraconstruction.example.</p>
<img src="assets/photos/framing-01.jpg" alt="Framing"></body></html>`);
w("css/styles.css", `@import url("https://fonts.googleapis.com/css2?family=Inter");\nbody{font-family:Inter,sans-serif}\n.map{height:400px}\n.band{background:url(../assets/photos/concrete-01.jpg)}\n`);
w("js/main.js", `const MAPS_API_KEY = "${KEY}";
function loadMap() {
  const s = document.createElement("script");
  s.src = "https://maps.googleapis.com/maps/api/js?key=" + MAPS_API_KEY + "&callback=initMap";
  document.head.appendChild(s);
}
function initMap() {
  const office = { lat: 25.6866, lng: -80.3838 };
  const map = new google.maps.Map(document.getElementById("map"), { center: office, zoom: 15 });
  new google.maps.Marker({ position: office, map });
}
loadMap();
`);
console.log(`        workspace ${ws}`);

// --- 1. first inspection -----------------------------------------------------------------
console.log("\n(1) first inspection (real AI ladder for the words):");
const n1 = events.length;
const r1 = await runInspection(ctx(realAi), staged, state.findings);
const types1 = since(n1).map((e) => e.type);
console.log(`        events: ${[...new Set(types1)].join(" > ")}`);
for (const f of r1.findings) console.log(`        RED ${f.segmentId}: ${f.title}\n            ${f.explanation}\n            fixes: ${f.fixes.map((x) => x.id).join(", ")}`);
console.log(`        data leaves to: ${r1.scan.dataLeavesTo.join(", ")}`);
ok(r1.findings.length === 2, "exactly 2 findings", String(r1.findings.length));
ok(reds() === "photos,web-packages", "red: web-packages + photos; all other segments green", reds());
ok(r1.findings.find((f) => f.segmentId === "web-packages")?.file === "js/main.js", "web-packages: the API key in js/main.js");
const photoF = r1.findings.find((f) => f.segmentId === "photos");
ok(photoF?.file === "assets/photos/crew-truck.jpg" && /owner's name/.test(photoF.explanation) && /serial/.test(photoF.explanation), "photos: crew-truck.jpg owner name + serial", photoF?.explanation);
ok(types1[0] === "tina.inspect.started" && types1[types1.length - 1] === "tina.inspect.finished" && types1.includes("tina.inspect.segment"), "started > segment walk > finished");
ok(!JSON.stringify(since(n1)).includes(KEY), "the key value never appears in any event");
ok(r1.scan.dataLeavesTo.includes("fonts.googleapis.com") && r1.scan.dataLeavesTo.includes("maps.googleapis.com"), "data leaves to fonts + maps");
const firstIds = r1.findings.map((f) => f.id).sort().join();

// --- 4. dead ladder: template words, same findings ---------------------------------------
console.log("\n(4) TINI_FAULT=gemini=down,claude=down:");
resetExplanations();
const r4 = await runInspection(ctx(deadAi), staged, state.findings);
for (const f of r4.findings) console.log(`        ${f.segmentId}: ${f.title} | ${f.explanation}`);
ok(r4.findings.map((f) => f.id).sort().join() === firstIds, "same finding ids");
ok(r4.findings.some((f) => f.title === "Google Maps key is visible in your website's code") && r4.findings.some((f) => f.title === "A photo still says who took it"), "template words");
resetExplanations();

// --- 2. fixes ---------------------------------------------------------------------------------
console.log("\n(2) fixes:");
const keyF = state.findings.find((f) => f.segmentId === "web-packages")!;
const n2 = events.length;
const fk = await applyFix(ctx(realAi), staged, keyF.id, "move-key-out");
console.log(`        move-key-out: ${fk.summary}`);
console.log(`        events: ${since(n2).map((e) => e.type).join(" > ")}`);
ok(fk.green && state.segments.find((s) => s.id === "web-packages")?.status === "green", "web-packages green after the rescan");
const gl = spawnSync("gitleaks", ["dir", ws, "--no-banner", "--log-level", "error", "-f", "json", "-r", "-", "--exit-code", "0", "--redact"], { encoding: "utf8" });
const glHits = JSON.parse(gl.stdout || "[]") as { File: string }[];
console.log(`        gitleaks on the whole workspace: ${glHits.length} leak(s) ${JSON.stringify(glHits.map((h) => path.relative(ws, h.File)))}`);
ok(glHits.length === 0, "gitleaks: no key anywhere in the workspace (assets included)");
const index = fs.readFileSync(path.join(ws, "index.html"), "utf8");
const embed = index.match(/<iframe class="tini-map[^>]*>/)?.[0] ?? "";
console.log(`        index.html now: ${embed}`);
ok(/src="https:\/\/www\.google\.com\/maps\?q=7420%20SW%20117th%20Ave%2C%20Suite%20200%2C%20Miami%2C%20FL%2033183&output=embed"/.test(embed), "keyless embed of the company address");
ok(/<div id="map" class="map" hidden>/.test(index), "old map div hidden");
ok(!/maps\.googleapis\.com\/maps\/api\/js/.test(fs.readFileSync(path.join(ws, "js/main.js"), "utf8")), "the JS loader can't load Google Maps any more");
ok(fs.readFileSync(path.join(ws, "assets/about/office-map.md"), "utf8").includes("[key removed by Tina]"), "key removed from the About copy too (originals untouched)");
ok(fs.readFileSync(path.join(H, "Clients/Rivera/About/office-map.md"), "utf8").includes(KEY), "original ~/Clients/Rivera/About still has it (never modified)");

const n3 = events.length;
const fp = await applyFix(ctx(realAi), staged, photoF!.id, "strip-metadata");
console.log(`        strip-metadata: ${fp.summary}`);
const t = (await identifyingTags([path.join(ws, "assets/photos/crew-truck.jpg")])).values().next().value ?? {};
ok(fp.green && state.segments.find((s) => s.id === "photos")?.status === "green" && Object.keys(t).length === 0, "photos green; crew-truck has no identifying tags", JSON.stringify(t));
ok(since(n3).some((e) => e.type === "fix.applied"), "fix.applied emitted");

// remove-photo: an unstripped copy of the original crew truck photo, used on the about page
fs.mkdirSync(path.join(ws, "images"), { recursive: true });
fs.copyFileSync(path.join(H, "Clients/Rivera/Photos/crew-truck.jpg"), path.join(ws, "images/crew-truck.jpg"));
w("about.html", fs.readFileSync(path.join(ws, "about.html"), "utf8").replace("</body>", `<img src="images/crew-truck.jpg" alt="Crew"></body>`));
const r5 = await runInspection(ctx(realAi), staged, state.findings);
const copyF = r5.findings.find((f) => f.file === "images/crew-truck.jpg");
ok(copyF?.segmentId === "photos" && copyF.severity === "high", "a copy outside assets maps to Photos (GPS -> high)", JSON.stringify(copyF && { s: copyF.segmentId, sev: copyF.severity }));
const rp = await applyFix(ctx(realAi), staged, copyF!.id, "remove-photo");
console.log(`        remove-photo: ${rp.summary}`);
const about = fs.readFileSync(path.join(ws, "about.html"), "utf8");
const newSrc = about.match(/<img src="([^"]+)" alt="Crew">/)?.[1] ?? "";
ok(!fs.existsSync(path.join(ws, "images/crew-truck.jpg")) && newSrc.startsWith("assets/photos/") && fs.existsSync(path.join(ws, newSrc)), `photo removed, about.html now points at ${newSrc}`);
ok(rp.green && state.segments.find((s) => s.id === "photos")?.status === "green", "photos green again");

// --- 3. key comes back; then goes away without a click ------------------------------------------
console.log("\n(3) regressions and silent clears:");
w("js/config.js", `export const MAPS_KEY = "${KEY}";\n`);
const r6 = await runInspection(ctx(realAi), staged, state.findings);
const back = r6.findings.find((f) => f.file === "js/config.js");
ok(back && state.segments.find((s) => s.id === "web-packages")?.status === "red", "key reintroduced -> web-packages red again");
fs.rmSync(path.join(ws, "js/config.js"));
const n7 = events.length;
const r7 = await runInspection(ctx(realAi), staged, state.findings);
const cleared = since(n7).filter((e) => e.type === "finding.cleared");
console.log(`        ${cleared.map((e) => JSON.stringify(e)).join("\n        ")}`);
ok(r7.findings.length === 0 && cleared.length === 1 && cleared[0].type === "finding.cleared" && cleared[0].findingId === back!.id, "key removed without a click -> finding.cleared");
ok(state.findings.length === 0 && state.segments.every((s) => s.status === "green"), "state: no findings, every segment green");

// crew mode: no started/red/green/finished of its own (project.ts emits those)
const n8 = events.length;
await runInspection(ctx(realAi), staged, state.findings, { mode: "crew" });
ok(since(n8).every((e) => e.type === "tina.inspect.segment" || e.type === "raw.log" || e.type === "finding.cleared"), "crew mode emits only segment walk + finding.cleared");

// --- 5. the report -----------------------------------------------------------------------------
console.log("\n(5) buildReport on this test's event log:");
const rep = buildReport(events);
for (const k of ["allowed", "blocked", "narrowed", "fixed"] as const) for (const l of rep[k]) console.log(`        ${k.padEnd(8)} ${l.what}  —  ${l.why}`);
console.log(`        dataLeavesTo: ${JSON.stringify(rep.dataLeavesTo)}`);
ok(rep.fixed.length >= 4 && rep.fixed.every((l) => /\(turn \d+\)$/.test(l.why)), "fixed lines, each tagged with its turn");
ok(rep.dataLeavesTo.includes("fonts.googleapis.com") && !rep.dataLeavesTo.includes("maps.googleapis.com"), "dataLeavesTo reflects the latest scan (maps gone after the fix)", JSON.stringify(rep.dataLeavesTo));
const live = fs.readdirSync("recordings").filter((f) => f.endsWith("-live.jsonl")).sort().pop();
if (live) {
  console.log(`\n(5) buildReport on the Stage 4 live recording ${live}:`);
  const lr = buildReport(eventsFromRecording(fs.readFileSync(path.join("recordings", live), "utf8")));
  for (const k of ["allowed", "blocked", "narrowed", "fixed"] as const) for (const l of lr[k]) console.log(`        ${k.padEnd(8)} ${l.what}  —  ${l.why}`);
  ok(lr.allowed.length >= 3 && lr.narrowed.some((l) => /turn 2/.test(l.why)), "live report: lines across turns 1 and 2");
}

// --- 6. a key in a script URL followed by "&" (gitleaks' default rule misses it) ---------------
console.log("\n(6) Maps key in <script src=\"...?key=KEY&callback=initMap\">:");
const ws6 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tini-amp-")));
fs.writeFileSync(path.join(ws6, "contact.html"), `<div id="map"></div>\n<script src="https://maps.googleapis.com/maps/api/js?key=${KEY}&callback=initMap" async defer></script>\n`);
const s6 = await scanWorkspace({ fence: { workspace: ws6, allowedDomains: [] }, workspace: ws6, pathMap: {}, fenceNote: "" });
console.log(`        engine ${s6.secretEngine}: ${JSON.stringify(s6.findings.map((f) => [f.type, f.file, f.snippet]))}`);
ok(s6.findings.some((f) => f.type === "api-key" && f.file === "contact.html") && !JSON.stringify(s6.findings.map((f) => f.snippet)).includes(KEY), "key found (with gitleaks on) and redacted in the snippet");
fs.rmSync(ws6, { recursive: true, force: true });

// --- 7. grouping: one finding per (type, segment); a fix acts on the whole group -------------
console.log("\n(7) 6 GPS photos outside assets + a key (the observe-mode shape):");
const ws7 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tini-group-")));
const jobsite = path.join(H, "Pictures/Jobsite2024");
const rolls = fs.readdirSync(jobsite).filter((f) => /^IMG_\d+\.jpg$/.test(f)).sort().slice(0, 30).map((f) => path.join(jobsite, f));
const rollTags = await identifyingTags(rolls);
const gpsSix = rolls.filter((f) => rollTags.get(path.resolve(f))?.GPSLatitude !== undefined).slice(0, 6);
fs.mkdirSync(path.join(ws7, "photos"));
for (const f of gpsSix) fs.copyFileSync(f, path.join(ws7, "photos", path.basename(f)));
fs.writeFileSync(path.join(ws7, "contact.html"), `<div id="map"></div>\n<script src="https://maps.googleapis.com/maps/api/js?key=${KEY}&callback=initMap" async defer></script>\n`);
const staged7: Staged = { fence: { workspace: ws7, allowedDomains: ["registry.npmjs.org"] }, workspace: ws7, pathMap: {}, fenceNote: "" };
const s7 = await scanWorkspace(staged7);
const g7 = s7.findings.find((f) => f.type === "photo-metadata");
console.log(`        ${s7.findings.length} finding(s): ${s7.findings.map((f) => `${f.type}/${f.segmentId} x${f.files.length}`).join(", ")}`);
ok(gpsSix.length === 6 && s7.findings.length === 2, "6 GPS photos + 1 key -> exactly 2 findings", String(s7.findings.length));
ok(g7?.files.length === 6 && g7.segmentId === "workspace", "the photo finding groups all 6 files on one segment");
const w7 = g7 ? await toFinding(deadAi, g7) : null;
console.log(`        title: ${w7?.title} | file: ${w7?.file} | fixes: ${w7?.fixes.map((x) => x.label).join(", ")}`);
ok(w7?.title === "6 photos still have GPS locations" && /and 5 more$/.test(w7.file ?? ""), "group title and file line");
let state7: WorldState = { ...initialState(), segments: [{ id: "workspace", label: "Workspace", kind: "workspace", detail: ws7, status: "red" }, { id: "web-packages", label: "Web packages", kind: "packages", detail: "", status: "red" }] };
const ev7: Ev[] = [];
const ctx7: Pick<CrewCtx, "emit" | "log" | "ai" | "state"> = { emit: (e) => { ev7.push(e); }, log: () => {}, ai: deadAi, state: () => state7 };
const f7 = await applyFix(ctx7, staged7, g7!.id, "strip-metadata");
const after7 = await identifyingTags(gpsSix.map((f) => path.join(ws7, "photos", path.basename(f))));
console.log(`        fix: "${f7.summary}" green=${f7.green}`);
ok(f7.green && [...after7.values()].every((t) => Object.keys(t).length === 0), "one click cleaned all 6 photos");
ok(f7.summary === "Photo locations removed from 6 photos", "short past-tense summary", f7.summary);
const k7 = s7.findings.find((f) => f.type === "api-key")!;
const fk7 = await applyFix(ctx7, staged7, k7.id, "move-key-out");
console.log(`        fix: "${fk7.summary}" green=${fk7.green}`);
ok(fk7.green && fk7.summary === "Key removed; map switched to a keyless embed", "key fix summary", fk7.summary);
fs.rmSync(ws7, { recursive: true, force: true });

// --- 8. report lines for every escalation choice ------------------------------------------------
console.log("\n(8) report: narrow / all / deny escalations:");
const opt = (id: "narrow" | "all" | "deny", label: string, detail: string) => ({ id, label, detail, recommended: id === "narrow" });
const escEvents = [
  { actor: "system", type: "turn.started", turnId: 2, prompt: "p" },
  { actor: "tini", type: "escalation.opened", escalationId: "e1", source: "agent", requested: "~/Pictures/Jobsite2024", ask: "", inspection: { totalFiles: 0, highlights: [] },
    options: [opt("narrow", "Allow only the 12 job-site photos", "Locations removed. The 1,199 personal photos and the driver's license scan stay out."), opt("all", "Allow the whole folder", ""), opt("deny", "Deny", "")] },
  { actor: "system", type: "escalation.resolved", escalationId: "e1", choice: "narrow", summary: "" },
  { actor: "tini", type: "escalation.opened", escalationId: "e2", source: "prompt", requested: "~/Documents/Rivera-HR", ask: "", inspection: { totalFiles: 0, highlights: [] }, options: [opt("all", "Allow the whole folder", ""), opt("deny", "Deny", "")] },
  { actor: "system", type: "escalation.resolved", escalationId: "e2", choice: "all", summary: "" },
  { actor: "tini", type: "escalation.opened", escalationId: "e3", source: "agent", requested: "~/Downloads", ask: "", inspection: { totalFiles: 0, highlights: [] }, options: [opt("deny", "Deny", "")] },
  { actor: "system", type: "escalation.resolved", escalationId: "e3", choice: "deny", summary: "" },
] as EngineEvent[];
const r8 = buildReport(escEvents);
for (const k of ["allowed", "blocked", "narrowed"] as const) for (const l of r8[k]) console.log(`        ${k.padEnd(8)} ${l.what}  —  ${l.why}`);
ok(r8.narrowed[0]?.what === "~/Pictures/Jobsite2024: only the 12 job-site photos, locations removed" && /\(turn 2\)$/.test(r8.narrowed[0].why), "narrow -> narrowed line");
ok(r8.allowed[0]?.what === "~/Documents/Rivera-HR: the whole folder", "all -> allowed line");
ok(r8.blocked[0]?.what === "~/Downloads" && /you said no/.test(r8.blocked[0].why), "deny -> blocked line");

fs.rmSync(process.env.TINI_PROJECTS_DIR!, { recursive: true, force: true });
await exiftool.end();
console.log(`\n${fail ? `${fail} FAILED, ${pass} passed` : `all ${pass} tina checks pass`}`);
process.exit(fail ? 1 : 0);
