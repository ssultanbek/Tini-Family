// AI ladder stress test: fake providers, no network, timeouts scaled down 50x.
// 100 randomized calls across every gemini x claude fault combination (36),
// including both failing. Asserts 100/100 schema-valid answers, the expected
// source for each combo, no cached fallbacks, and worst-case latency within the
// scaled budget (real scale: about 20s -> 400ms here).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { createAi, withFault, type FaultMode, type Provider, type AiSource } from "../src/ai.ts";

const SCALE = 50;
const G_T = 8000 / SCALE, C_T = 10000 / SCALE, RETRY = 600 / SCALE, BUDGET = 20000 / SCALE;
const MODES: FaultMode[] = ["ok", "503", "429", "hang", "garbage", "down"];

const Schema = z.object({ label: z.string().min(1), count: z.number().int().nonnegative() });
type Answer = z.infer<typeof Schema>;
const FALLBACK: Answer = { label: "fallback", count: 0 };

// A healthy fake model: answers from the input after 5-60ms (well under the scaled timeouts).
const healthy = (name: string): Provider => async ({ user, signal }) => {
  await new Promise<void>((r, j) => { const t = setTimeout(r, 5 + Math.random() * 55); signal.addEventListener("abort", () => { clearTimeout(t); j(new Error("aborted")); }); });
  const { n } = JSON.parse(user) as { n: number };
  return JSON.stringify({ label: `${name}-${n}`, count: n });
};

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "tini-ai-stress-"));
const calls: { g: FaultMode; c: FaultMode; n: number }[] = [];
for (let i = 0; i < 100; i++) {
  const combo = i % 36; // every combination at least twice
  calls.push({ g: MODES[Math.floor(combo / 6)], c: MODES[combo % 6], n: Math.floor(Math.random() * 1000) });
}
calls.sort(() => Math.random() - 0.5);

const expectSource = (g: FaultMode, c: FaultMode): AiSource[] =>
  g === "ok" ? ["gemini", "cache"] : c === "ok" ? ["claude", "cache"] : ["fallback"];

let valid = 0, wrongSource = 0, worst = 0;
const bySource: Record<string, number> = {};
const t0 = Date.now();
// 20 at a time, so the run takes seconds, not minutes.
for (let i = 0; i < calls.length; i += 20) {
  await Promise.all(calls.slice(i, i + 20).map(async ({ g, c, n }) => {
    const ask = createAi({
      gemini: withFault(healthy("gemini"), g), claude: withFault(healthy("claude"), c),
      geminiTimeoutMs: G_T, claudeTimeoutMs: C_T, retryDelayMs: RETRY,
      cacheDir: path.join(cacheDir, `${g}-${c}`), // per combo, so a gemini answer can't mask a claude fault
    });
    const r = await ask({ task: "stress", instructions: "count", input: { n }, schema: Schema, fallback: FALLBACK });
    if (Schema.safeParse(r.value).success) valid++;
    if (!expectSource(g, c).includes(r.source)) { wrongSource++; console.log(`!! gemini=${g} claude=${c} -> ${r.source} (${r.trail})`); }
    worst = Math.max(worst, r.ms);
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  }));
}

// Fallbacks must never be cached: a fresh call with both providers down again must say "fallback", not "cache".
const both = createAi({ gemini: withFault(healthy("g"), "down"), claude: withFault(healthy("c"), "down"), cacheDir: path.join(cacheDir, "down-down"), geminiTimeoutMs: G_T, claudeTimeoutMs: C_T, retryDelayMs: RETRY });
const again = await both({ task: "stress", instructions: "count", input: { n: 1 }, schema: Schema, fallback: FALLBACK });
// ...and no combo where both providers fail may have written a cache file.
const bothFailDirs = fs.readdirSync(cacheDir).filter((d) => !d.split("-").includes("ok"));
const noCachedFallback = again.source === "fallback" && bothFailDirs.every((d) => fs.readdirSync(path.join(cacheDir, d)).length === 0);

// A never-throw check: a schema that can't be turned into JSON Schema and a provider that throws synchronously.
const weird = createAi({ gemini: () => { throw new Error("sync boom"); }, claude: null, cacheDir: null });
const w = await weird({ task: "weird", instructions: "", input: "x", schema: z.custom<string>((v) => typeof v === "string"), fallback: "fb" });

fs.rmSync(cacheDir, { recursive: true, force: true });
const ok = valid === 100 && wrongSource === 0 && worst <= BUDGET && noCachedFallback && w.value === "fb";
console.log(`combos=36 calls=100 valid=${valid}/100 wrongSource=${wrongSource} sources=${JSON.stringify(bySource)}`);
console.log(`worst=${worst}ms budget=${BUDGET}ms (scale 1/${SCALE}: gemini ${G_T}ms, claude ${C_T}ms, retry ${RETRY}ms) total=${Date.now() - t0}ms`);
console.log(`fallback never cached: ${noCachedFallback}; sync-throwing provider -> ${w.source} "${w.value}"`);
console.log(ok ? "AI STRESS PASS" : "AI STRESS FAIL");
process.exit(ok ? 0 : 1);
