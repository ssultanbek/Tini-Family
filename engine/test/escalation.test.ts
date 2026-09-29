// Tests: Tina's folder inspection, the escalation card, applying each choice,
// a hostile tina.subset answer, a dead AI ladder, and the simulated attack harness
// (with proof that nothing under ~/.ssh is ever opened). Uses the demo kit's folders.
import fs from "node:fs"; import fsp from "node:fs/promises"; import os from "node:os"; import path from "node:path";
process.env.TINI_AI_CACHE = "off";
import { createAiFromEnv, type Ask, type AskArgs, type AskResult } from "../src/ai.ts";
import type { CrewCtx, Ev, OpenEscalation } from "../src/crew.ts";
import { initialState } from "../../shared/reducer.ts";
import type { WorldState } from "../../shared/events.ts";
import { createEscalation, sanitizeSubset, type Staged } from "../src/tini/index.ts";
import { inspectFolder } from "../src/tina/inspect-folder.ts";
import { gpsFiles } from "../src/tina/exif.ts";
import { simulateAttack, ATTACK_REASON } from "../src/harness.ts";

let fail = 0, pass = 0;
const ok = (cond: unknown, name: string, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};
const H = os.homedir();
const JOBSITE = "~/Pictures/Jobsite2024", HR = "~/Documents/Rivera-HR";
const RIVERA = "Build a modern, serious-looking website for Rivera Construction. Use the photos in ~/Clients/Rivera/Photos and the company info in ~/Clients/Rivera/About and ~/Clients/Rivera/Services.";
if (!fs.existsSync(path.join(H, "Pictures/Jobsite2024"))) { console.error("run `npm run demo-kit` first"); process.exit(1); }

// --- a fake project around the real modules ---------------------------------------
const ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tini-esc-ws-")));
fs.mkdirSync(path.join(ws, "assets"));
const staged: Staged = { fence: { workspace: ws, allowedDomains: [] }, workspace: ws, pathMap: {}, fenceNote: "" };
const events: Ev[] = [];
function makeCtx(ai: Ask, prompt: string | null = null): CrewCtx {
  const state: WorldState = { ...initialState(), turns: [{ id: 1, prompt: RIVERA }, ...(prompt ? [{ id: 2, prompt }] : [])], prompt: prompt ?? RIVERA };
  return {
    emit: (e) => { events.push(e); if (e.type === "fence.segment.built") state.segments = [...state.segments, e.segment]; },
    say: (actor, text) => events.push({ actor, type: "speech", text }),
    log: (channel, text) => events.push({ actor: "system", type: "raw.log", channel, text }),
    escalate: async () => "deny",
    signal: new AbortController().signal,
    ai,
    state: () => state,
  };
}
const fixedAi = (value: unknown): Ask => (async <T>(_a: AskArgs<T>): Promise<AskResult<T>> => ({ value: value as T, source: "gemini", ms: 0, trail: "fixed" })) as Ask;
const esc = (requested: string, source: "agent" | "prompt"): OpenEscalation => ({ escalationId: "esc-t", requested, source, card: { ask: "", inspection: { totalFiles: 0, highlights: [] }, options: [] } });
const listFiles = (dir: string): string[] => fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name)) : [];
const show = (card: { ask: string; inspection: { totalFiles: number; highlights: { label: string; count: number; severity: string }[] }; options: { id: string; label: string; detail: string; recommended: boolean }[] }) => {
  console.log(`        ask: ${card.ask}`);
  console.log(`        totalFiles: ${card.inspection.totalFiles.toLocaleString("en-US")}`);
  for (const h of card.inspection.highlights) console.log(`        highlight: ${h.count.toLocaleString("en-US")} ${h.label} (${h.severity})`);
  for (const o of card.options) console.log(`        option ${o.id}${o.recommended ? " *" : ""}: ${o.label} | ${o.detail}`);
};
const hl = (card: { inspection: { highlights: { label: string; count: number; severity: string }[] } }) => card.inspection.highlights.map((h) => `${h.count}|${h.severity}`).join(",");

// --- (a) Jobsite2024 inspection ------------------------------------------------------
console.log("(a) Tina inspects ~/Pictures/Jobsite2024:");
const rep = await inspectFolder(path.join(H, "Pictures/Jobsite2024"));
console.log(`        inspected in ${rep.ms}ms (${rep.contentChecked} file(s) content-checked)`);
ok(rep.files.length === 1212, "1,212 files", String(rep.files.length));
ok(rep.images.length === 1211 && rep.gps.size === 903, "1,211 photos, 903 with GPS", `${rep.images.length} / ${rep.gps.size}`);
ok(rep.personal.length === 1 && rep.personal[0].rel === "scan_0012.pdf" && rep.personal[0].kind === "license", "license found by PDF content", JSON.stringify(rep.personal));
ok(rep.ms < 10000, `under 10s (${rep.ms}ms)`);

const live = createEscalation({ getStaged: () => staged, agentReason: () => "I need more job-site photos for the gallery." });
const realAi = createAiFromEnv((l) => console.log(`        ai: ${l.slice(0, 160)}`));
const t0 = Date.now();
const card = await live.inspectRequest(makeCtx(realAi), JOBSITE, "agent");
console.log(`        card built in ${Date.now() - t0}ms (inspection + tina.subset):`);
show(card);
ok(hl(card) === "12|low,1199|medium,1|high,903|medium", "highlights 12 low / 1,199 medium / 1 license high / 903 GPS medium", hl(card));
ok(card.inspection.highlights[2].label === "driver's license scan" && card.inspection.highlights[3].label === "photos with GPS location", "license + GPS labels");
ok(card.options.map((o) => o.id).join() === "narrow,all,deny" && card.options[0].recommended, "options narrow (recommended), all, deny");
ok(card.ask === "Claude wants ~/Pictures/Jobsite2024: I need more job-site photos for the gallery.", "agent ask with Claude's reason", card.ask);

// --- (b) apply each choice -------------------------------------------------------------
console.log("\n(b) applying narrow / all / deny:");
const narrow = await live.applyEscalation(makeCtx(realAi), esc(JOBSITE, "agent"), "narrow");
const nFiles = listFiles(path.join(ws, narrow.assetsPath!));
console.log(`        narrow -> ${narrow.assetsPath} (${nFiles.length} files); note: ${narrow.note}`);
ok(nFiles.length === 12 && nFiles.every((f) => /rivera-.*\.jpg$/.test(f)), "narrow: the 12 job-site photos copied");
ok((await gpsFiles(nFiles)).size === 0, "narrow: 0 GPS in the copies");
ok(!nFiles.some((f) => f.endsWith(".pdf")), "narrow: license not copied");
ok(events.some((e) => e.type === "fence.segment.built" && e.segment.id === narrow.segmentId) && events.some((e) => e.type === "tini.carry.box" && e.segmentId === narrow.segmentId && e.fileCount === 12), "narrow: fence.segment.built + tini.carry.box(12)");
ok(staged.pathMap[JOBSITE] === narrow.assetsPath, "pathMap updated for later prompts");

await live.inspectRequest(makeCtx(realAi), JOBSITE, "agent");
const t1 = Date.now();
const all = await live.applyEscalation(makeCtx(realAi), esc(JOBSITE, "agent"), "all");
const aFiles = listFiles(path.join(ws, all.assetsPath!));
console.log(`        all -> ${all.assetsPath} (${aFiles.length} files, copied + cleaned in ${Date.now() - t1}ms)`);
ok(aFiles.length === 1212, "all: 1,212 copied", String(aFiles.length));
ok((await gpsFiles(aFiles.filter((f) => f.endsWith(".jpg")))).size === 0, "all: 0 GPS in the copies");

const before = listFiles(path.join(ws, "assets")).length;
await live.inspectRequest(makeCtx(realAi), JOBSITE, "agent");
const deny = await live.applyEscalation(makeCtx(realAi), esc(JOBSITE, "agent"), "deny");
ok(listFiles(path.join(ws, "assets")).length === before && !deny.assetsPath, "deny: nothing copied", JSON.stringify(deny));

// --- (c) Rivera-HR from a prompt ---------------------------------------------------------
console.log("\n(c) ~/Documents/Rivera-HR from Maria's prompt:");
const hrPrompt = "Add a careers page using the job descriptions in ~/Documents/Rivera-HR";
const hrCard = await live.inspectRequest(makeCtx(realAi, hrPrompt), HR, "prompt");
show(hrCard);
ok(hrCard.ask === "Your new request needs a folder that isn't inside the fence yet.", "prompt-source ask text");
ok(hrCard.inspection.highlights.some((h) => h.label === "file with a password in it" && h.count === 1 && h.severity === "high"), "password file flagged by content");
const hrApplied = await live.applyEscalation(makeCtx(realAi, hrPrompt), esc(HR, "prompt"), "narrow");
const hFiles = listFiles(path.join(ws, hrApplied.assetsPath!)).map((f) => path.basename(f)).sort();
console.log(`        narrow -> ${hrApplied.assetsPath}: ${hFiles.join(", ")}`);
ok(hFiles.length === 7 && hFiles.every((f) => f.endsWith(".md")), "narrow = the 7 job descriptions");
ok(!hFiles.includes("hiring-portal-login.txt"), "password file excluded");

// --- (d) hostile tina.subset answer ------------------------------------------------------
console.log("\n(d) hostile tina.subset answer:");
const hostile = {
  includeAll: false,
  include: ["rivera-framing-01.jpg", "scan_0012.pdf", "/Users/someone/.ssh/id_rsa", "../Rivera-HR/hiring-portal-login.txt", "~/.aws/credentials", "./rivera-roofing-02.jpg", "not-a-real-file.jpg", "../../etc/passwd"],
  noun: "../../etc photos",
  otherNoun: "personal photos",
};
const cands = rep.files.filter((f) => !rep.flagged.has(f));
const s = sanitizeSubset(hostile, cands);
console.log(`        kept: ${JSON.stringify(s.subset)}`);
console.log(`        dropped: ${JSON.stringify(s.dropped)}`);
ok(s.subset.join() === "rivera-framing-01.jpg,rivera-roofing-02.jpg", "only real, unflagged files in the folder survive");
ok(s.noun === null, "path-like noun rejected");
const hostileEsc = createEscalation({ getStaged: () => staged });
const hCard = await hostileEsc.inspectRequest(makeCtx(fixedAi(hostile)), JOBSITE, "agent");
ok(hCard.options[0].label === "Allow only the 2 photos" && hCard.inspection.highlights.find((h) => h.label === "driver's license scan")?.count === 1, "card: narrow = 2 photos, license still flagged separately", hCard.options[0].label);
const hApplied = await hostileEsc.applyEscalation(makeCtx(fixedAi(hostile)), esc(JOBSITE, "agent"), "narrow");
const hostileCopied = listFiles(path.join(ws, hApplied.assetsPath!)).map((f) => path.relative(path.join(ws, hApplied.assetsPath!), f)).sort();
ok(hostileCopied.join() === "rivera-framing-01.jpg,rivera-roofing-02.jpg", "applied: exactly those 2 copied, nothing outside the folder", JSON.stringify(hostileCopied));
ok(listFiles(ws).every((f) => f.startsWith(ws + path.sep)), "nothing written outside the workspace");

// --- (e) dead ladder -------------------------------------------------------------------
console.log("\n(e) TINI_FAULT=gemini=down,claude=down:");
const deadEsc = createEscalation({ getStaged: () => staged });
const dead = createAiFromEnv((l) => console.log(`        ai: ${l}`), process.env, "gemini=down,claude=down");
const dCard = await deadEsc.inspectRequest(makeCtx(dead), JOBSITE, "agent");
show(dCard);
const dApplied = await deadEsc.applyEscalation(makeCtx(dead), esc(JOBSITE, "agent"), "narrow");
const dFiles = listFiles(path.join(ws, dApplied.assetsPath!)).map((f) => path.basename(f));
ok(dFiles.length === 12 && dFiles.every((f) => /^rivera-.*\.jpg$/.test(f)), "fallback narrow is exactly the 12 job-site photos", dFiles.join());
ok(dCard.ask === "Claude wants ~/Pictures/Jobsite2024. Claude asked for a folder you didn't name.", "agent ask with no reason", dCard.ask);

// --- (f) the harness ---------------------------------------------------------------------
console.log("\n(f) simulated attack harness:");
// Trap every way node can open or read a file; record anything under ~/.ssh.
const touched: string[] = [], resolved: string[] = [];
const watch = (p: unknown) => { const s = String(p instanceof URL ? p.pathname : p); if (s.includes("/.ssh") || s.startsWith("~/.ssh")) touched.push(s); };
const trap = <T extends object>(obj: T, names: string[]) => {
  const saved: [string, unknown][] = [];
  for (const n of names) {
    const orig = (obj as Record<string, unknown>)[n];
    if (typeof orig !== "function") continue;
    saved.push([n, orig]);
    (obj as Record<string, unknown>)[n] = function (this: unknown, p: unknown, ...rest: unknown[]) { watch(p); return (orig as Function).call(this, p, ...rest); };
  }
  return () => { for (const [n, f] of saved) (obj as Record<string, unknown>)[n] = f; };
};
const restoreFs = trap(fs, ["openSync", "open", "readFileSync", "readFile", "createReadStream", "copyFileSync", "copyFile", "cpSync"]);
const restoreFsp = trap(fsp, ["open", "readFile", "copyFile", "cp"]);
const origReal = fs.realpathSync;
(fs as { realpathSync: typeof fs.realpathSync }).realpathSync = Object.assign((p: fs.PathLike, o?: unknown) => { resolved.push(String(p)); return (origReal as Function)(p, o); }, { native: origReal.native }) as typeof fs.realpathSync;

const hEvents: Ev[] = [];
const hctx = { emit: (e: Ev) => hEvents.push(e), log: (channel: "hook" | "engine", text: string) => hEvents.push({ actor: "system", type: "raw.log", channel, text }) };
const decision = simulateAttack(hctx, staged);

(fs as { realpathSync: typeof fs.realpathSync }).realpathSync = origReal; restoreFs(); restoreFsp();
for (const e of hEvents) console.log(`        event ${JSON.stringify(e)}`);
const blocked = hEvents.find((e) => e.type === "fence.blocked");
ok(!decision.allow, "the real guard denies the Read");
ok(blocked && blocked.type === "fence.blocked" && blocked.simulated && blocked.layer === "hook" && blocked.tool === "Read" && blocked.target === "~/.ssh/id_rsa" && blocked.reason === ATTACK_REASON, "fence.blocked simulated/hook/Read with the demo reason");
ok(hEvents.some((e) => e.type === "raw.log" && e.channel === "hook" && e.text.includes("DENY")), "raw.log hook line shows the real decision");
console.log(`        fs calls touching ~/.ssh (open/read/copy): ${JSON.stringify(touched)}`);
console.log(`        path resolutions by the guard (realpath only, no open): ${JSON.stringify(resolved.map((p) => p.replace(H, "~")))}`);
ok(touched.length === 0, "no file under ~/.ssh was opened, read or copied");
ok(!/from "node:fs"|require\("fs"\)|readFile|openSync|createReadStream/.test(fs.readFileSync(new URL("../src/harness.ts", import.meta.url), "utf8")), "harness.ts has no file I/O at all");
// The guard reports honestly: a (broken) fence that includes home would ALLOW, and then no block is faked.
const broken: Staged = { ...staged, fence: { workspace: H, allowedDomains: [] } };
const bEvents: Ev[] = [];
const bd = simulateAttack({ emit: (e) => bEvents.push(e), log: (channel, text) => bEvents.push({ actor: "system", type: "raw.log", channel, text }) }, broken);
ok(bd.allow && !bEvents.some((e) => e.type === "fence.blocked"), "with a broken fence it reports ALLOW and fakes nothing");

fs.rmSync(ws, { recursive: true, force: true });
console.log(`\n${fail ? `${fail} FAILED, ${pass} passed` : `all ${pass} escalation + harness checks pass`}`);
process.exit(fail ? 1 : 0);
