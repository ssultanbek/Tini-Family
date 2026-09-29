// Probe (cheap, ~$0.05): in one streaming-input session,
//  (1) is maxTurns per user turn or per session?  maxTurns=3, then two turns that
//      each need 2 round-trips (4 in total). If it's per session, turn B errors with max_turns.
//  (2) how does interrupt() show up in the stream, and does the session keep working after it?
// Run: cd engine && npx tsx --env-file=.env spike/probe-turns.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { query, type HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { dogOptions } from "../src/dog.ts";
import { realish, type Fence } from "../src/guard.ts";
import { Inbox } from "../src/inbox.ts";

const wsRoot = path.join(os.homedir(), "tini-projects");
fs.mkdirSync(wsRoot, { recursive: true });
const workspace = realish(fs.mkdtempSync(path.join(wsRoot, "probe-")));
const fence: Fence = { workspace, allowedDomains: [] };
const inbox = new Inbox();
const turns = [
  "Create a.txt containing the word alpha. Then reply with just: done",
  "Create b.txt containing the word beta. Then reply with just: done",
  "Create five files c1.txt to c5.txt, one Write call per file, each containing its own name. Then list them with ls.",
  "Reply with just the word: ok",
];
let turn = 0, interruptAt = 0, postToolCount = 0;
const t0 = Date.now();
const t = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const post: HookCallback = async (raw) => {
  const i = raw as { tool_name: string; tool_input: unknown; tool_response: unknown };
  postToolCount++;
  console.log(`${t()} [PostToolUse] ${i.tool_name} input=${JSON.stringify(i.tool_input).slice(0, 80)} response=${JSON.stringify(i.tool_response).slice(0, 100)}`);
  if (turn === 2 && !interruptAt) {
    interruptAt = Date.now();
    console.log(`${t()} >>> calling q.interrupt()`);
    q.interrupt().then((r) => console.log(`${t()} <<< interrupt() resolved: ${JSON.stringify(r)}`), (e) => console.log(`${t()} <<< interrupt() rejected: ${e.message}`));
  }
  return {};
};

const opts = dogOptions(fence, {}, { maxTurns: 3, maxBudgetUsd: 0.5, stderr: () => {} });
opts.hooks = { ...opts.hooks, PostToolUse: [{ hooks: [post] }] };
inbox.push(turns[0]);
const q = query({ prompt: inbox, options: opts });
for await (const m of q) {
  const tag = m.type === "assistant"
    ? `assistant ${m.message.content.map((b) => b.type === "text" ? `text:"${b.text.slice(0, 60)}"` : b.type === "tool_use" ? `tool_use:${b.name}` : b.type).join(" ")}`
    : m.type === "user" ? `user ${Array.isArray(m.message.content) ? m.message.content.map((b) => (typeof b === "object" && "type" in b ? b.type : "?")).join(",") : "text"}${(m as { isSynthetic?: boolean }).isSynthetic ? " (synthetic)" : ""} ${JSON.stringify(m.message.content).slice(0, 120)}`
    : m.type === "result" ? `RESULT subtype=${m.subtype} is_error=${m.is_error} num_turns=${m.num_turns} terminal_reason=${m.terminal_reason} stop_reason=${m.stop_reason} cost=${m.total_cost_usd.toFixed(4)} result=${JSON.stringify("result" in m ? m.result : (m as { errors?: unknown }).errors).slice(0, 120)}`
    : `${m.type}${"subtype" in m ? "/" + m.subtype : ""}`;
  console.log(`${t()} [turn ${turn + 1}] ${tag}`);
  if (m.type === "result") {
    turn++;
    if (turn < turns.length) { console.log(`${t()} --- pushing turn ${turn + 1}`); inbox.push(turns[turn]); }
    else inbox.close();
  }
}
console.log(`files: ${fs.readdirSync(workspace).join(", ")}  postToolUse=${postToolCount}`);
