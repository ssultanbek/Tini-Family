// The request door's decision (runner.classifyRequest): sensitive requests are hard-blocked
// with no card; ordinary folders open a card.  npx tsx test/request.test.ts
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { realish } from "../src/guard.ts";
import { classifyRequest } from "../src/runner.ts";

const ws = realish(fs.mkdtempSync(path.join(os.homedir(), "tini-ws-req-")));
fs.mkdirSync(path.join(ws, "assets"));
const cases: [string, string][] = [
  ["~/.ssh/id_rsa", "private"], ["~/.ssh", "private"], ["~/.aws/credentials", "private"], ["~/.npmrc", "private"],
  ["~/Library/Keychains", "private"], ["/etc/passwd", "private"], ["~", "private"], ["~/Documents/app/.env", "private"],
  ["./assets", "inside"], [path.join(ws, "index.html"), "inside"],
  ["~/Pictures/Jobsite2024", "ask"], ["~/Documents/Rivera-HR", "ask"],
  ["~/Pictures/NoSuchFolder-tini", "missing"],
];
let fail = 0;
for (const [p, want] of cases) {
  const got = classifyRequest(p, ws).kind;
  if (got !== want) { fail++; console.log("FAIL", p, "want", want, "got", got); }
}
fs.rmSync(ws, { recursive: true, force: true });
console.log(fail ? `${fail} failures` : `all ${cases.length} request-door cases pass`);
process.exit(fail ? 1 : 0);
