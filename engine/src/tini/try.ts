// npm run tini:try -- "<prompt>" [--plan-only]
// Runs Tini's plan + stage standalone and prints the plan, the events and the workspace tree.
import fs from "node:fs";
import path from "node:path";
import { exiftool } from "exiftool-vendored";
import { createAiFromEnv } from "../ai.ts";
import type { Ev } from "../crew.ts";
import { planFence, rewritePrompt, stageFence } from "./index.ts";

const args = process.argv.slice(2);
const planOnly = args.includes("--plan-only");
const prompt = args.filter((a) => a !== "--plan-only").join(" ").trim();
if (!prompt) { console.error('usage: npm run tini:try -- "<prompt>" [--plan-only]'); process.exit(1); }

const show = (ev: Ev) => {
  const { actor, type, ...rest } = ev as Ev & Record<string, unknown>;
  console.log(`  event ${actor.padEnd(5)} ${type.padEnd(22)} ${JSON.stringify(rest)}`);
};

function tree(dir: string, prefix = "", depth = 0): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [];
  const shown = entries.slice(0, 8);
  for (const e of shown) {
    lines.push(`${prefix}${e.name}${e.isDirectory() ? "/" : ""}`);
    if (e.isDirectory() && depth < 3) lines.push(...tree(path.join(dir, e.name), prefix + "  ", depth + 1));
  }
  if (entries.length > shown.length) lines.push(`${prefix}... ${entries.length - shown.length} more`);
  return lines;
}

async function main() {
  const ai = createAiFromEnv((l) => console.log(`  ai    ${l}`));
  console.log(`PROMPT: ${prompt}\n\n-- planning --`);
  const plan = await planFence(prompt, ai, { emit: show, log: (l) => console.log(`  log   ${l}`) });
  console.log(`\n-- plan (words by ${plan.planSource}) --`);
  console.log(`workspaceName: ${plan.workspaceName}`);
  console.log(`allowedDomains: ${JSON.stringify(plan.allowedDomains)}`);
  console.log(`sources:`); for (const s of plan.sources) console.log(`  ${s.segmentId.padEnd(18)} ${s.realPath}`);
  console.log(`segments (${plan.segments.length}):`); for (const s of plan.segments) console.log(`  [${s.kind.padEnd(9)}] ${s.id.padEnd(18)} "${s.label}" - ${s.detail}`);
  console.log(`contract: ${plan.contract.title}`);
  for (const l of plan.contract.allowed) console.log(`  allowed:  ${l}`);
  for (const l of plan.contract.stripped) console.log(`  stripped: ${l}`);
  console.log(`  outside:  ${plan.contract.outside}`);
  if (plan.dropped.length) console.log(`dropped from AI answer: ${JSON.stringify(plan.dropped)}`);
  if (planOnly) return;

  console.log(`\n-- staging --`);
  const staged = await stageFence(plan, show);
  console.log(`\nworkspace: ${staged.workspace}`);
  console.log(`fence: ${JSON.stringify(staged.fence)}`);
  console.log(`pathMap: ${JSON.stringify(staged.pathMap, null, 2)}`);
  console.log(`prompt for Claude: ${rewritePrompt(prompt, staged.pathMap)}`);
  console.log(`\nfenceNote:\n${staged.fenceNote}`);
  console.log(`\n-- workspace tree --\n${tree(staged.workspace).join("\n")}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => exiftool.end());
