// npm run warm
// Fills the AI ladder's disk cache (~/.tini/ai-cache) for the demo's inputs, so the stage
// run answers from cache even if Gemini is overloaded. Cache keys are the exact inputs, so
// this rebuilds them the way the live engine does: the real planner, the real escalation
// pipeline on the demo kit's folders, and Tina's real scanner on a small sample site.
// Prints which rung answered each call. Needs `npm run demo-kit` first.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exiftool } from "exiftool-vendored";
import { initialState } from "../../shared/reducer.ts";
import type { WorldState } from "../../shared/events.ts";
import { createAiFromEnv, type Ask, type AskArgs } from "../src/ai.ts";
import type { CrewCtx } from "../src/crew.ts";
import { createEscalation, planFence, stripGps, type Staged } from "../src/tini/index.ts";
import { explain, resetExplanations } from "../src/tina/explain.ts";
import { scanWorkspace, type FindingType } from "../src/tina/scan.ts";

// The final demo prompts, word for word as in mock/recordings/demo-main.jsonl (cache keys are exact).
const DEMO_PROMPT = "Build a modern, serious-looking website for Rivera Construction with a gallery of this year's projects, a map of our office on the Contact page, and our team photo on the About page. Use our Google Maps key from the About folder so our custom pin shows. Use the photos in ~/Clients/Rivera/Photos and the company info in ~/Clients/Rivera/About and ~/Clients/Rivera/Services.";
const HR_PROMPT = "Add a careers page using the job descriptions in ~/Documents/Rivera-HR";
// Turn 2: Maria names Jobsite2024 in her prompt (source "prompt").
const JOBSITE_PROMPT = "Add this year's job-site photos from ~/Pictures/Jobsite2024 to the gallery.";

// Likely ways Claude loads the Maps JavaScript API; the redacted line is part of the cache key.
const MAPS_LINES = [
  `<script src="https://maps.googleapis.com/maps/api/js?key=KEY&callback=initMap" async defer></script>`,
  `<script async defer src="https://maps.googleapis.com/maps/api/js?key=KEY&callback=initMap"></script>`,
  `<script src="https://maps.googleapis.com/maps/api/js?key=KEY&loading=async&callback=initMap" async></script>`,
];

const H = os.homedir();
const RIVERA = path.join(H, "Clients/Rivera");
if (!fs.existsSync(path.join(H, "Pictures/Jobsite2024")) || !fs.existsSync(RIVERA)) {
  console.error("run `npm run demo-kit` first"); process.exit(1);
}

const results: { what: string; source: string }[] = [];
const base = createAiFromEnv();
// Records the rung behind every ladder call so each warm step can print it.
let lastCalls: string[] = [];
const ai: Ask = async <T>(a: AskArgs<T>) => {
  const r = await base(a);
  lastCalls.push(`${a.task} -> ${r.source} in ${r.ms}ms (${r.trail})`);
  return r;
};
function report(what: string, source: string) {
  results.push({ what, source });
  console.log(`  ${what}`);
  for (const c of lastCalls) console.log(`      ai: ${c}`);
  console.log(`      source: ${source}`);
  lastCalls = [];
}

function ctxFor(prompt: string): CrewCtx {
  const state: WorldState = { ...initialState(), turns: [{ id: 1, prompt: DEMO_PROMPT }, { id: 2, prompt }], prompt };
  return {
    emit: () => {}, say: () => {}, log: () => {},
    escalate: async () => "deny",
    signal: new AbortController().signal,
    ai, state: () => state,
  };
}

async function main() {
  console.log("warm: filling ~/.tini/ai-cache for the demo inputs\n");

  // 1. Tini's plan for the demo prompt.
  console.log("tini.plan");
  const plan = await planFence(DEMO_PROMPT, ai);
  report(`planFence(demo prompt): ${plan.segments.length} segments, "${plan.contract.title}"`, plan.planSource);

  // 2. The request door: Tina's subset for each folder, as a prompt-sourced request.
  console.log("\ntina.subset");
  const esc = createEscalation({ getStaged: () => null });
  for (const [folder, prompt] of [["~/Pictures/Jobsite2024", JOBSITE_PROMPT], ["~/Documents/Rivera-HR", HR_PROMPT]]) {
    const card = await esc.inspectRequest(ctxFor(prompt), folder, "prompt");
    const src = lastCalls.length ? lastCalls[lastCalls.length - 1].split(" ")[2] : "no AI call";
    report(`inspectRequest(${folder}, "prompt"): ${card.options[0]?.label ?? "(no options)"}`, src);
  }
  esc.reset();

  // 3. Tina's words for the two findings the demo produces, from a real scan of a sample site.
  console.log("\ntina.explain");
  const ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tini-warm-")));
  try {
    const keyMatch = fs.readFileSync(path.join(RIVERA, "About/office-map.md"), "utf8").match(/AIza[A-Za-z0-9_-]{35}/);
    if (!keyMatch) throw new Error("no Maps key in the demo kit's office-map.md");
    const truck = path.join(ws, "images/crew-truck.jpg");
    fs.mkdirSync(path.dirname(truck), { recursive: true });
    fs.copyFileSync(path.join(RIVERA, "Photos/crew-truck.jpg"), truck);
    await stripGps(truck);                          // the stager's copy: GPS gone, owner and serial left
    const staged: Staged = { fence: { workspace: ws, allowedDomains: [] }, workspace: ws, pathMap: {}, fenceNote: "" };

    const warmType = async (type: FindingType, label: string) => {
      const scan = await scanWorkspace(staged, { useGitleaks: true });
      const f = scan.findings.find((x) => x.type === type);
      if (!f) { report(`explain(${type}) ${label}: no finding produced`, "skipped"); return; }
      resetExplanations();                          // explain() memoizes per type per process
      const w = await explain(ai, f);
      report(`explain(${type}) ${label}: "${w.title}"`, w.source);
    };
    for (const [i, line] of MAPS_LINES.entries()) {
      fs.writeFileSync(path.join(ws, "contact.html"), `<!doctype html>\n<html>\n<body>\n  <div id="map"></div>\n  ${line.replace("KEY", keyMatch[0])}\n</body>\n</html>\n`);
      await warmType("api-key", `variant ${i + 1}`);
    }
    fs.writeFileSync(path.join(ws, "contact.html"), `<!doctype html>\n<html><body><img src="images/crew-truck.jpg" alt="Our crew"></body></html>\n`);
    await warmType("photo-metadata", "crew-truck.jpg");
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }

  console.log("\nsummary");
  for (const r of results) console.log(`  ${r.source.padEnd(9)} ${r.what}`);
  // Key findings always use fixed wording (explain.ts: no AI words for keys), so "template" is expected there.
  const bad = results.filter((r) => r.source === "fallback" || r.source === "skipped" || (r.source === "template" && !r.what.startsWith("explain(api-key)")));
  console.log(bad.length ? `\n${bad.length} call(s) not cached (fallback/template/skipped): run again when the providers are up.` : "\nall calls cached");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => exiftool.end());
