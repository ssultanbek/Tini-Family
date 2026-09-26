// Real calls through the AI ladder with engine/.env (npm run ai:smoke). Never prints keys.
// 1) normal, 2) TINI_FAULT=gemini=down, 3) TINI_FAULT=gemini=down,claude=down. Cache off so each call is live.
import { z } from "zod";
import { createAiFromEnv } from "../src/ai.ts";

const Schema = z.object({ segments: z.array(z.object({ label: z.string(), purpose: z.string() })).min(1).max(8) });
const args = {
  task: "smoke-plan",
  instructions: "You label fence segments for a tool that limits what an AI coding agent may touch. Keep labels to 1-3 words.",
  input: { prompt: "Build a website for Rivera Construction using ~/Clients/Rivera/Photos and ~/Clients/Rivera/About", folders: [{ name: "Photos", files: 31 }, { name: "About", files: 2 }] },
  schema: Schema,
  fallback: { segments: [{ label: "Workspace", purpose: "fallback" }] },
  cache: false,
};

console.log(`keys: gemini=${process.env.GEMINI_API_KEY ? "set" : "MISSING"} anthropic=${process.env.ANTHROPIC_API_KEY ? "set" : "MISSING"}  models: ${process.env.GEMINI_MODEL || "gemini-3.8-flash"} / ${process.env.TINI_BACKUP_MODEL || "claude-haiku-4-5"}`);
for (const fault of [undefined, "gemini=down", "gemini=down,claude=down"]) {
  const ask = createAiFromEnv((l) => console.log(`  [ai] ${l}`), process.env, fault);
  const r = await ask(args);
  console.log(`TINI_FAULT=${fault ?? "(none)"} -> source=${r.source} ${r.ms}ms  value=${JSON.stringify(r.value).slice(0, 140)}`);
}
