// npm run tina:scan -- <workspace> [recording.jsonl]
// Read-only: scans a workspace the way Tina's per-turn inspection does and prints the
// findings (redacted), what's in scope and where data goes. Optionally prints the
// access report built from a recording.
import fs from "node:fs";
import path from "node:path";
import { createAiFromEnv } from "../ai.ts";
import { buildReport, eventsFromRecording } from "../report.ts";
import { walkWorkspace, scanWorkspace } from "./scan.ts";
import { toFinding } from "./findings.ts";
import type { Staged } from "../tini/stager.ts";

const [wsArg, recArg] = process.argv.slice(2);
if (!wsArg) { console.error("usage: npm run tina:scan -- <workspace> [recording.jsonl]"); process.exit(1); }
const workspace = fs.realpathSync(path.resolve(wsArg));
const segs = ["workspace", "web-packages", ...fs.readdirSync(path.join(workspace, "assets"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)];
const staged: Staged = { workspace, fence: { workspace, allowedDomains: ["registry.npmjs.org"] }, pathMap: {}, fenceNote: "" };

const ai = createAiFromEnv((l) => console.log(`  ai  ${l.slice(0, 150)}`));
const scan = await scanWorkspace(staged, { segmentIds: segs });
console.log(`workspace: ${workspace}  (${walkWorkspace(workspace).length} files, ${scan.scope.length} in scope, secrets via ${scan.secretEngine}, ${scan.ms}ms)`);
console.log(`in scope: ${scan.scope.join(", ")}`);
console.log(`data leaves to: ${scan.dataLeavesTo.join(", ") || "nothing"}`);
console.log(`findings: ${scan.findings.length}`);
for (const r of scan.findings) {
  const f = await toFinding(ai, r);
  console.log(`  [${f.severity}] ${f.segmentId} ${f.id} ${f.file}\n     ${f.title}\n     ${f.explanation}\n     fixes: ${f.fixes.map((x) => x.id).join(", ")}`);
}
if (recArg) {
  const rep = buildReport(eventsFromRecording(fs.readFileSync(recArg, "utf8")));
  console.log(`\nreport from ${recArg}:`);
  for (const k of ["allowed", "blocked", "narrowed", "fixed"] as const) for (const l of rep[k]) console.log(`  ${k.padEnd(8)} ${l.what}  —  ${l.why}`);
  console.log(`  dataLeavesTo: ${JSON.stringify(rep.dataLeavesTo)}`);
}
