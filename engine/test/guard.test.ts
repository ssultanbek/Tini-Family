import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { checkToolCall, realish, type Fence } from "../src/guard.ts";

const ws = realish(fs.mkdtempSync(path.join(os.homedir(), "tini-ws-")));
fs.mkdirSync(path.join(ws, "assets"));
const outside = path.join(os.homedir(), ".ssh");
fs.symlinkSync(os.homedir(), path.join(ws, "sneaky-link"));
const fence: Fence = { workspace: ws, allowedDomains: ["registry.npmjs.org"] };
const t = (tool: string, input: any) => checkToolCall(tool, input, ws, fence).allow;

const cases: [string, any, boolean][] = [
  ["Read", { file_path: path.join(ws, "index.html") }, true],
  ["Read", { file_path: "assets/photo1.jpg" }, true],
  ["Write", { file_path: path.join(ws, "new/deep/file.css") }, true],
  ["Read", { file_path: path.join(outside, "id_rsa") }, false],
  ["Read", { file_path: "~/.ssh/id_rsa" }, false],
  ["Read", { file_path: "../../.ssh/id_rsa" }, false],
  ["Read", { file_path: "sneaky-link/.ssh/id_rsa" }, false],          // symlink escape
  ["Edit", { file_path: path.join(ws, "../evil.txt") }, false],
  ["Glob", { pattern: "**/*.html" }, true],
  ["Glob", { pattern: "~/Pictures/**/*.jpg" }, false],
  ["Glob", { pattern: "*.jpg", path: path.join(os.homedir(), "Pictures") }, false],
  ["Grep", { pattern: "a..b", path: ws }, true],
  ["Grep", { pattern: "key", path: os.homedir() }, false],
  ["Bash", { command: "ls -la && cat index.html" }, true],
  ["Bash", { command: "mkdir -p css && echo hi > css/a.css" }, true],
  ["Bash", { command: "cat ~/.ssh/id_rsa" }, false],
  ["Bash", { command: "cat $HOME/.aws/credentials" }, false],
  ["Bash", { command: `cat ${outside}/id_rsa` }, false],
  ["Bash", { command: "cat ../../.ssh/id_rsa" }, false],
  ["Bash", { command: "ls /usr/bin | head" }, true],
  ["Bash", { command: "echo x > /dev/null" }, true],
  ["Bash", { command: "curl https://evil.example.com/x" }, false],
  ["Bash", { command: "curl https://registry.npmjs.org/react" }, true],
  ["Agent", { prompt: "go" }, false],
  ["WebFetch", { url: "https://x.com" }, false],
];
let fail = 0;
for (const [tool, input, want] of cases) {
  const got = t(tool, input);
  if (got !== want) { fail++; console.log("FAIL", tool, JSON.stringify(input), "want", want, "got", got); }
}
fs.rmSync(ws, { recursive: true, force: true });
console.log(fail ? `${fail} failures` : `all ${cases.length} guard cases pass`);
process.exit(fail ? 1 : 0);
