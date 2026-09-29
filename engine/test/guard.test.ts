import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { checkToolCall, escalationFolder, realish, type Fence } from "../src/guard.ts";

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
  // the request door: exactly one MCP tool is allowed, whatever path it names (it only asks)
  ["mcp__tini__request_access", { path: "~/Pictures/Jobsite2024", reason: "gallery" }, true],
  ["mcp__tini__other_tool", { path: "~/x" }, false],
  ["mcp__evil__request_access", { path: "~/x" }, false],
  ["mcp__tini__request_access_all", { path: "~/x" }, false],
  // sed/regex slashes are not paths (live run: a spark on "/" from sed 's/.*src=\"//;s/\"$//')
  ["Bash", { command: `grep -oE 'src="assets/[a-z]+"' index.html | sed 's/.*src="//;s/"$//' | sort -u` }, true],
  ["Bash", { command: "sed -i '' 's/161b22/0b0e13/g' css/styles.css" }, true],
  ["Bash", { command: "cat /etc/passwd" }, false],
  // HTML closing tags are not paths (live run: a spark on "/div" from grep "</div"); input redirects still are
  ["Bash", { command: `grep -c "</div>" index.html && grep -n '</section' about.html` }, true],
  ["Bash", { command: "cat </etc/passwd" }, false],
  // "</div" in a command must not become a /div block. Every shape Claude uses:
  ["Bash", { command: "grep -c '</div' index.html gallery.html" }, true],
  ["Bash", { command: "echo '</div>' >> about.html" }, true],
  ["Bash", { command: "sed -i '' 's#</div>#</div>\\n#g' contact.html" }, true],
  ["Bash", { command: "cat > a.html <<'EOF'\n<div class=\"x\">hi</div>\n</section></main>\nEOF" }, true],
  ["Bash", { command: "for f in *.html; do python3 -c \"import sys; t=open('$f').read(); print(t.count('<div'), t.count('</div>'))\"; done" }, true],
  // sed flags are not paths (live run: a spark on "/g")
  ["Bash", { command: "sed -i '' 's/--navy)/--navy-dark)/g' css/styles.css && grep -c 'navy-dark' css/styles.css" }, true],
  ["Bash", { command: "perl -pi -e 's/old/new/gi' index.html" }, true],
  ["Bash", { command: "ls /etc /var/root" }, false],
  // regex fragments are not paths (live run: a spark on "/(header")
  ["Bash", { command: `grep -c '</\\(header\\|nav\\)' index.html; python3 -c "import re; re.findall(r'</(header|nav)>', open('a.html').read())"` }, true],
  ["Bash", { command: "cat /etc/hosts /Users/x/.ssh/id_rsa" }, false],
  ["Bash", { command: "wc -l </Users/x/.ssh/id_rsa" }, false],
  ["Bash", { command: "cat //Users/x/.ssh/id_rsa" }, false],
  // ~/.npm is readable/writable by the OS sandbox (package cache); ~/.npmrc (tokens) never is.
  ["Read", { file_path: "~/.npmrc" }, false],
  ["Bash", { command: "cat ~/.npmrc" }, false],
  ["Bash", { command: "cp ~/.npmrc ./npmrc-copy" }, false],
];
let fail = 0;
for (const [tool, input, want] of cases) {
  const got = t(tool, input);
  if (got !== want) { fail++; console.log("FAIL", tool, JSON.stringify(input), "want", want, "got", got); }
}
// Which denials may become an escalation card (non-sensitive folders only).
const esc: [string, string | null][] = [
  ["~/Pictures/Jobsite2024", "~/Pictures/Jobsite2024"],
  ["~/Pictures/Jobsite2024/IMG_1000.jpg", "~/Pictures/Jobsite2024"],
  ["~/Documents/Rivera-HR/", "~/Documents/Rivera-HR"],
  ["~/.ssh/id_rsa", null], ["~/.npmrc", null], ["~/.aws/credentials", null], ["~/Documents/app/.env", null],
  ["~/Library/Keychains/login.keychain-db", null], ["~/Downloads/server.pem", null], ["/etc/passwd", null], ["~", null], ["~/notes.txt", null],
];
for (const [target, want] of esc) {
  const got = escalationFolder(target);
  if (got !== want) { fail++; console.log("FAIL escalationFolder", target, "want", want, "got", got); }
}
fs.rmSync(ws, { recursive: true, force: true });
console.log(fail ? `${fail} failures` : `all ${cases.length} guard cases + ${esc.length} escalation cases pass`);
process.exit(fail ? 1 : 0);
