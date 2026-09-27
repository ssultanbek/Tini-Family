// The dog: ONE persistent Claude Code session per project (Agent SDK, streaming input).
// Each turn pushes a message into the open session and resolves at Claude's result.
// What Claude does becomes events: successful tool calls -> bricks, hook denials ->
// sparks (and, for a non-sensitive folder, an escalation card), "Operation not permitted"
// in Bash output -> sparks from the OS layer, Claude's words -> short speech bubbles,
// the result -> the turn's summary. Stop = the SDK's interrupt().
//
// Verified in sdk.d.ts + spike/probe-turns.ts (Sept 26):
// - maxTurns is PER USER TURN (num_turns resets each turn; 2+2 round-trips passed with maxTurns=3).
// - maxBudgetUsd and total_cost_usd are PER query() = per project session (cumulative).
//   So the per-turn cost cap is ours: estimated from each assistant message's usage.
// - interrupt() resolves at once ({"still_queued":[]}); the stream then yields a synthetic
//   tool_result rejection, "[Request interrupted by user]", and a result with
//   subtype "error_during_execution", terminal_reason "aborted_streaming". The session
//   keeps working for the next message.
import fs from "node:fs";
import path from "node:path";
import { createSdkMcpServer, query, tool, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { CrewCtx } from "./crew.ts";
import { dogOptions, type DogPolicy } from "./dog.ts";
import { escalationFolder, expandHome, isInside, pretty, realish, REQUEST_TOOL, type Fence, type GuardDecision } from "./guard.ts";
import { Inbox } from "./inbox.ts";
import { isSensitive } from "./tini/paths.ts";

export interface RunnerConfig {
  fence: Fence;
  fenceNote: string;           // appended to Claude Code's system prompt
  rewrite?: (text: string) => string;   // Maria's real paths -> ./assets copies
  model?: string;              // default "sonnet"
  maxTurnsPerTurn?: number;    // SDK maxTurns (per user turn)
  sessionBudgetUsd?: number;   // SDK maxBudgetUsd (whole session)
  turnBudgetUsd?: number;      // ours, estimated mid-turn
  speechGapMs?: number;
  /** After every brick (e.g. the demo harness fires after turn 1's 4th brick). */
  onBrick?: (ctx: CrewCtx) => void;
  /** Observe mode swaps in its own decision policy and sandbox read roots. */
  policy?: DogPolicy;
  /** The request_access tool (default on; observe mode has no fence to ask through). */
  requestDoor?: boolean;
}

const REQUEST_DESCRIPTION =
  "Ask the owner for access to a file or folder outside your workspace. Use it whenever the job needs something that isn't in ./assets, " +
  "including material the owner's messages or files point you to (for example \"more photos are in ~/Pictures/...\"). " +
  "Never try to open outside paths yourself: they are blocked. Asking is always safe: nothing is opened, the owner decides in the app, " +
  "and private locations are refused automatically. Give the path and a one-line reason. Approved copies appear in ./assets/ and you get " +
  "a message when they are there. This call returns immediately: keep working with what you have meanwhile.";

type Waiter = { resolve: (summary: string) => void; reject: (e: Error) => void; abandoned: boolean; startCost: number };

const PRIVATE_NAMES: [RegExp, string][] = [
  [/^~\/\.ssh(\/|$)/, "your SSH keys"], [/^~\/\.aws(\/|$)/, "your AWS keys"], [/^~\/\.npmrc$/, "your npm login token"],
  [/^~\/\.gnupg(\/|$)/, "your encryption keys"], [/(^|\/)\.env/, "a secrets file"], [/^~\/Library\/Keychains/, "your passwords keychain"],
];
const friendly = (target: string) => PRIVATE_NAMES.find(([re]) => re.test(target))?.[1] ?? target;

export class DogRunner {
  private inbox: Inbox | null = null;
  private q: Query | null = null;
  private alive = false;
  private sessions = 0;
  private waiters: Waiter[] = [];
  private ctx: CrewCtx | null = null;
  private escalated = new Set<string>();
  private blockedThisTurn = new Set<string>();
  private tools = new Map<string, { name: string; input: Record<string, unknown> }>();
  private lastSpeech = 0;
  private speechBuf: string[] = [];
  private speechTimer: NodeJS.Timeout | null = null;
  private wantActivity = false;   // Claude's last words were code-ish: say what it's doing at its next tool call
  private sessionCost = 0;
  private turnEstimate = 0;
  private seenMsgIds = new Set<string>();
  private overBudget = false;
  private price = { in: 3, out: 15 };   // $/MTok, updated from the init message's model
  private reasons = new Map<string, string>();   // requested path -> Claude's one-line reason

  constructor(private cfg: RunnerConfig) {}

  /** Sends one message and resolves with the turn's summary at Claude's result. */
  async runTurn(ctx: CrewCtx, message: string): Promise<string> {
    this.ensureSession(ctx);
    this.ctx = ctx;
    this.blockedThisTurn.clear(); this.turnEstimate = 0; this.overBudget = false;
    const text = this.cfg.rewrite ? this.cfg.rewrite(message) : message;
    this.log("sdk", `-> Claude: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
    const waiter: Waiter = { resolve: () => {}, reject: () => {}, abandoned: false, startCost: this.sessionCost };
    const done = new Promise<string>((resolve, reject) => { waiter.resolve = resolve; waiter.reject = reject; });
    this.waiters.push(waiter);
    const onAbort = () => {
      waiter.abandoned = true;                 // its late "aborted" result is swallowed below
      this.log("sdk", "Stop: interrupt() sent");
      this.q?.interrupt().then((r) => this.log("sdk", `interrupt receipt: ${JSON.stringify(r ?? null)}`), (e) => this.log("sdk", `interrupt failed: ${(e as Error).message}`));
    };
    ctx.signal.addEventListener("abort", onAbort, { once: true });
    this.inbox!.push(text);
    try { return await done; }
    finally { ctx.signal.removeEventListener("abort", onAbort); }
  }

  /** Reset: end the session; pending turns are dropped. */
  close() {
    for (const w of this.waiters) w.abandoned = true;
    this.waiters = [];
    this.inbox?.close();
    try { this.q?.close(); } catch { /* already gone */ }
    this.q = null; this.inbox = null; this.alive = false; this.ctx = null;
    this.escalated.clear(); this.reasons.clear();
  }

  /** Claude's own words for why it asked (request_access), for the escalation card. */
  agentReason(requested: string): string | undefined { return this.reasons.get(requested); }

  // --- session --------------------------------------------------------------------
  private ensureSession(ctx: CrewCtx) {
    if (this.alive) return;
    const restart = this.sessions++ > 0;
    this.inbox = new Inbox();
    const opts = dogOptions(this.cfg.fence, {
      onDecision: (tool, input, d) => this.onDecision(tool, input, d),
      onToolDone: (tool, input) => this.onToolDone(tool, input),
    }, {
      // The request door: one in-process MCP tool, always loaded (ToolSearch isn't in the dog's tool set).
      ...(this.cfg.requestDoor === false ? {} : { mcpServers: { tini: createSdkMcpServer({ name: "tini", version: "1.0.0", alwaysLoad: true, tools: [
        tool("request_access", REQUEST_DESCRIPTION, {
          path: z.string().describe("The file or folder you need, e.g. ~/Pictures/Jobsite2024"),
          reason: z.string().describe("One line: why the job needs it"),
        }, async ({ path: p, reason }) => ({ content: [{ type: "text" as const, text: this.onRequest(p, reason) }] })),
      ] }) }, allowedTools: [REQUEST_TOOL] }),
      model: this.cfg.model ?? "sonnet",
      maxTurns: this.cfg.maxTurnsPerTurn ?? 40,
      maxBudgetUsd: this.cfg.sessionBudgetUsd ?? 6,
      systemPrompt: {
        type: "preset", preset: "claude_code",
        append: this.cfg.fenceNote + (restart ? "\n\nThis is a new session for a project already in progress: the workspace already contains your earlier work. Look at it before changing things." : ""),
      },
      stderr: (s) => this.onStderr(s),
    }, this.cfg.policy);
    this.q = query({ prompt: this.inbox, options: opts });
    this.alive = true;
    ctx.log("config", `dog session ${restart ? "restarted" : "opened"}: model=${opts.model} maxTurns/turn=${opts.maxTurns} sessionBudget=$${opts.maxBudgetUsd} turnBudget=$${this.cfg.turnBudgetUsd ?? 2}`);
    void this.consume(this.q);
  }

  private async consume(q: Query) {
    let why = "session ended";
    try { for await (const m of q) this.onMessage(m); }
    catch (e) { why = (e as Error).message; }
    if (q !== this.q) return;                  // closed by Reset
    this.alive = false;
    this.log("sdk", `Claude session closed: ${why}`);
    for (const w of this.waiters.splice(0)) if (!w.abandoned) w.reject(new Error(`Claude session closed: ${why}`));
  }

  private onMessage(m: SDKMessage) {
    switch (m.type) {
      case "system":
        if (m.subtype === "init") {
          if (/sonnet-5|haiku/.test(m.model)) this.price = m.model.includes("haiku") ? { in: 1, out: 5 } : { in: 2, out: 10 };
          if (this.sessions === 1 && this.turnEstimate === 0) this.log("sdk", `session ${m.session_id} model=${m.model} tools=${m.tools.join(",")}`);
        }
        return;
      case "assistant": {
        const id = m.message.id;
        if (id && !this.seenMsgIds.has(id)) {
          this.seenMsgIds.add(id);
          const u = m.message.usage;
          this.turnEstimate += ((u.input_tokens ?? 0) * this.price.in + (u.cache_creation_input_tokens ?? 0) * this.price.in * 1.25
            + (u.cache_read_input_tokens ?? 0) * this.price.in * 0.1 + (u.output_tokens ?? 0) * this.price.out) / 1e6;
          const cap = this.cfg.turnBudgetUsd ?? 2;
          if (this.turnEstimate > cap && !this.overBudget) {
            this.overBudget = true;
            this.log("sdk", `turn budget $${cap} reached (est. $${this.turnEstimate.toFixed(2)}): interrupting`);
            this.q?.interrupt().catch(() => {});
          }
        }
        for (const b of m.message.content) {
          if (b.type === "text" && b.text.trim()) {
            this.log("sdk", `Claude: ${b.text.replace(/\s+/g, " ").slice(0, 400)}`);
            const line = speechLine(b.text);
            if (line) { this.wantActivity = false; this.speak(line); } else this.wantActivity = true;
          }
          if (b.type === "tool_use") {
            const input = (b.input ?? {}) as Record<string, unknown>;
            this.tools.set(b.id, { name: b.name, input });
            if (this.wantActivity) { this.wantActivity = false; this.speak(activityLine(b.name, input)); }
          }
        }
        return;
      }
      case "user": {
        const content = m.message.content;
        if (!Array.isArray(content)) return;
        for (const b of content) {
          if (typeof b !== "object" || b.type !== "tool_result") continue;
          const tool = this.tools.get(b.tool_use_id);
          if (tool?.name !== "Bash") continue;
          const out = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? b.content.map((c) => (c.type === "text" ? c.text : "")).join("\n") : "";
          if (out.includes("Operation not permitted")) this.osBlocked(out, String(tool.input.command ?? ""));
        }
        return;
      }
      case "result": {
        this.sessionCost = m.total_cost_usd;
        const w = this.waiters.shift();
        const turnCost = w ? m.total_cost_usd - w.startCost : 0;
        this.log("sdk", `result ${m.subtype} (${m.terminal_reason ?? "-"}) turns=${m.num_turns} turn cost $${turnCost.toFixed(3)} session $${m.total_cost_usd.toFixed(3)}`);
        if (!w || w.abandoned) return;          // the interrupted turn finishing late: already reported as "Stopped by you"
        let summary: string;
        if (m.subtype === "success") summary = summarize(m.result, SUMMARY_MAX);
        else if (this.overBudget) summary = "Stopped: this turn reached its budget";
        else if (m.subtype === "error_max_turns") summary = "Stopped: this turn reached its step limit";
        else if (m.subtype === "error_max_budget_usd") summary = "Stopped: the project reached its budget";
        else summary = "Stopped: Claude hit an error";
        if (m.subtype === "success") this.log("sdk", `Claude's result: ${m.result.replace(/\s+/g, " ").slice(0, 600)}`);
        w.resolve(summary);
        return;
      }
    }
  }

  // --- events -----------------------------------------------------------------------
  private live() { return this.ctx && !this.ctx.signal.aborted ? this.ctx : null; }
  private safe(fn: (ctx: CrewCtx) => void) { const c = this.live(); if (!c) return; try { fn(c); } catch { /* stale session */ } }
  private log(channel: "sdk" | "hook" | "config", text: string) { const c = this.ctx; if (!c) return; try { c.log(channel, text); } catch { /* stale */ } }

  private onDecision(tool: string, input: Record<string, unknown>, d: GuardDecision) {
    const summary = `${tool} ${JSON.stringify(input).slice(0, 160)}`;
    if (d.allow) { this.log("hook", `ALLOW ${summary}`); return; }
    this.log("hook", `DENY  ${summary}  <- ${d.reason}`);
    let folder = d.kind === "path" ? escalationFolder(d.target) : null;
    if (folder && isSensitive(expandHome(folder))) folder = null;   // private: a spark, never a card
    const reason = folder
      ? `Claude asked for ${folder}, a folder you didn't name. Tini is asking you first.`
      : d.kind === "network" ? `Claude tried to reach ${d.target}, a website you didn't approve. Tini blocked it.`
      : d.kind === "tool" ? `Claude tried to use the ${d.target} tool, which isn't part of this job. Tini blocked it.`
      : `Claude tried to reach ${friendly(d.target)}${friendly(d.target) !== d.target ? ` (${d.target})` : ""}. That's outside the fence, so Tini blocked it.`;
    const key = `hook:${folder ?? d.target}`;
    this.safe((ctx) => {
      if (!this.blockedThisTurn.has(key)) {
        this.blockedThisTurn.add(key);
        ctx.emit({ actor: "dog", type: "fence.blocked", target: folder ?? d.target, reason, layer: "hook", tool, simulated: false });
      }
      // Ask the owner in the background; the hook has already answered "deny" and Claude keeps working.
      if (folder && !this.escalated.has(folder)) { this.escalated.add(folder); ctx.escalate(folder, "agent").catch(() => {}); }
    });
  }

  /** request_access: ask the owner in the background and answer Claude at once. */
  private onRequest(raw: string, reason: string): string {
    const ctx = this.live();
    if (!ctx) return "No turn is running right now.";
    const { kind, display, folder } = classifyRequest(raw, this.cfg.fence.workspace);
    const why = String(reason ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    this.log("hook", `REQUEST ${display}: ${why} -> ${kind}`);
    if (kind === "inside") return `${display} is already inside your workspace. Use it directly.`;
    if (kind === "private") {
      this.safe((c) => c.emit({ actor: "dog", type: "fence.blocked", target: display, tool: "request_access", layer: "hook", simulated: false,
        reason: `Claude asked for ${friendly(display)}${friendly(display) !== display ? ` (${display})` : ""}. That's private, so Tini said no without asking you.` }));
      return "Denied: that location is private and can't be requested. Continue without it and don't try to open it.";
    }
    if (kind === "missing") return `${display} doesn't exist. Continue without it.`;
    if (this.escalated.has(folder!) || this.escalated.has(display)) return "Already requested: the owner is reviewing it. Keep working with what you have.";
    this.escalated.add(folder!); this.escalated.add(display);
    this.reasons.set(display, why);
    this.safe((c) => {
      this.speak(cutWords(`Can I have ${display}? ${why}`, SPEECH_MAX));
      c.escalate(display, "agent").catch(() => {});
    });
    return "The owner is reviewing this. Keep working; approved files will appear in ./assets/ and you'll get a message when they're there.";
  }

  private onToolDone(tool: string, input: Record<string, unknown>) {
    if (tool === REQUEST_TOOL) return;   // asking isn't building
    const op = tool === "Write" ? "write" : tool === "Edit" ? "edit" : tool === "Bash" ? "run" : "read";
    const ws = this.cfg.fence.workspace;
    const rel = (p: unknown) => {
      const s = String(p ?? "");
      if (!s.startsWith("/")) return s;
      return isInside(s, ws) ? path.relative(ws, s) || "." : pretty(s);   // observe mode reads real folders: show ~/...
    };
    const file = tool === "Bash" ? String(input.command ?? "").replace(/\s+/g, " ").slice(0, 80)
      : tool === "Glob" ? String(input.pattern ?? "")
      : tool === "Grep" ? `grep ${String(input.pattern ?? "")}`
      : rel(input.file_path);
    this.safe((ctx) => {
      ctx.emit({ actor: "dog", type: "dog.brick.placed", op, file, bricks: ctx.state().bricks + 1 });
      this.cfg.onBrick?.(ctx);
    });
  }

  private osBlocked(output: string, command: string) {
    const line = output.split("\n").find((l) => l.includes("Operation not permitted")) ?? "";
    const m = line.match(/([~/][^\s:'"]*)\s*:\s*Operation not permitted/);
    const target = m ? pretty(m[1]) : command.slice(0, 80);
    const key = `os:${target}`;
    this.safe((ctx) => {
      ctx.log("hook", `OS sandbox: ${line.trim().slice(0, 200)}`);
      if (this.blockedThisTurn.has(key)) return;
      this.blockedThisTurn.add(key);
      ctx.emit({ actor: "dog", type: "fence.blocked", target, tool: "Bash", layer: "os-sandbox", simulated: false,
        reason: `A command tried to reach ${friendly(target)}. The Mac's own sandbox stopped it: the second layer of the fence.` });
    });
  }

  /** One plain line per bubble; lines less than 2s apart are merged into the next bubble. */
  private speak(line: string) {
    if (!line) return;
    const gap = this.cfg.speechGapMs ?? 2000;
    const now = Date.now();
    if (!this.speechTimer && now - this.lastSpeech >= gap) { this.emitSpeech(line); return; }
    if (!this.speechBuf.includes(line)) this.speechBuf.push(line);
    if (!this.speechTimer) this.speechTimer = setTimeout(() => {
      this.speechTimer = null;
      const lines = this.speechBuf.splice(0);
      if (lines.length) this.emitSpeech(mergeLines(lines));
    }, Math.max(0, gap - (now - this.lastSpeech)));
  }
  private emitSpeech(line: string) {
    this.lastSpeech = Date.now();
    this.safe((ctx) => ctx.say("dog", line));
  }

  private onStderr(s: string) {
    for (const line of s.split("\n").map((l) => l.trim()).filter(Boolean)) {
      if (line.includes("claude.ai connectors are disabled")) continue;
      this.log("sdk", `[stderr] ${line.slice(0, 300)}`);
    }
  }
}

/**
 * The request door's decision, pure code: "private" (dotfiles, keys, Library, outside home, home itself:
 * a spark, never a card), "inside" (already in the workspace), "missing", or "ask" (open a card).
 */
export function classifyRequest(raw: string, workspace: string): { kind: "private" | "inside" | "missing" | "ask"; display: string; folder: string | null } {
  const abs = realish(path.resolve(workspace, expandHome(String(raw ?? "").trim())));
  const display = pretty(abs);
  if (isInside(abs, workspace)) return { kind: "inside", display, folder: null };
  const folder = escalationFolder(display);
  if (!folder || isSensitive(abs)) return { kind: "private", display, folder: null };
  if (!fs.existsSync(abs)) return { kind: "missing", display, folder };
  return { kind: "ask", display, folder };
}

export const SPEECH_MAX = 80;
export const SUMMARY_MAX = 400;

/** Cuts at a word boundary, never mid-word. */
export function cutWords(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "").replace(/[\s,;:–—-]+$/, "") + "…";
}

const stripMarkdown = (s: string) => s.replace(/```[\s\S]*?```/g, " ").replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "").replace(/[#*_>|]+/g, " ").replace(/\s+/g, " ").trim();
// hex colors, rgb()/rgba(), CSS units, backticks, braces/angle brackets, paths, file names, CSS custom properties, calls
const CODEISH = /#[0-9a-f]{3,8}\b|\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{6}\b|\brgba?\s*\(|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|ms)\b|`|[{}<>]|(?:^|[\s("'])[.~]?\/[\w.-]|\b[\w-]+\.(?:html?|css|js|mjs|json|md|jpe?g|png|svg|webp|gif|ts|txt|pdf)\b|(?:^|\s)--[a-z][\w-]*|\b\w+\(\)/i;

/** Claude's first clean sentence as a bubble, or null if it's empty or code-ish. */
export function speechLine(text: string, max = SPEECH_MAX): string | null {
  const raw = text.replace(/```[\s\S]*?```/g, " ").replace(/\*\*|__/g, "").trim();
  const first = (raw.match(/^[\s\S]+?[.!?](?=\s|$)/)?.[0] ?? raw.split("\n")[0]).trim();
  if (!first || CODEISH.test(first)) return null;
  const clean = stripMarkdown(first).replace(/:$/, ".");
  return clean ? cutWords(clean, max) : null;
}

/** What the dog is doing, in plain words, from its tool call. */
export function activityLine(tool: string, input: Record<string, unknown>): string {
  const file = String(input.file_path ?? input.path ?? "");
  const base = path.basename(file).toLowerCase();
  const name = base.replace(/\.[a-z0-9]+$/, "").replace(/[-_]+/g, " ");
  const body = `${input.content ?? ""} ${input.new_string ?? ""} ${input.old_string ?? ""}`.toLowerCase();
  const thing = /\.css$/.test(base) ? "the styles"
    : /\.m?js$/.test(base) ? "the scripts"
    : /\.html?$/.test(base) ? (name === "index" ? "the home page" : `the ${name} page`)
    : /\.(jpe?g|png|webp|gif|heic)$/.test(base) ? "the photos"
    : /\.(md|txt|pdf|docx?)$/.test(base) ? (/about|company|services/.test(file) ? "the company info" : "the notes")
    : "the files";
  if (/maps\.google|google\.maps|maps\/embed|maps\.googleapis/.test(body)) return "Adding the contact map";
  switch (tool) {
    case "Write": return cutWords(`Building ${thing}`, SPEECH_MAX);
    case "Edit": return thing === "the styles" ? (/header|\bnav\b/.test(body) ? "Styling the header" : "Styling the site") : cutWords(`Updating ${thing}`, SPEECH_MAX);
    case "Read": return cutWords(`Looking at ${thing}`, SPEECH_MAX);
    case "Glob": case "Grep": return "Looking through the files";
    case "Bash": return "Checking the work";
    case REQUEST_TOOL: return "Asking the owner for access";
    default: return "Working on it";
  }
}

/** Lines that arrived less than 2s apart become one bubble (the latest wins if they don't fit together). */
export function mergeLines(lines: string[], max = SPEECH_MAX): string {
  const joined = lines.map((l) => (/[.!?…]$/.test(l) ? l : `${l}.`)).join(" ");
  return joined.length <= max ? joined : lines[lines.length - 1];
}

/** First sentence, markdown stripped, at most `max` characters (kept for callers outside speech). */
export function shortLine(text: string, max: number): string {
  const plain = stripMarkdown(text);
  if (!plain) return "";
  const sentence = plain.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? plain;
  return cutWords(sentence, max);
}

/** The turn's result for the timeline: Claude's final message as plain text, up to `max` characters,
 *  cut at a sentence end when one is near, else at a word boundary. */
export function summarize(result: string, max = SUMMARY_MAX): string {
  const plain = stripMarkdown(result.replace(/\n\s*\n/g, "\n").split("\n").map((l) => l.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, "")).filter(Boolean)
    .map((l) => (/[.!?:]$/.test(l) ? l : `${l};`)).join(" ").replace(/;$/, "."));
  if (!plain) return "Done.";
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > max * 0.6 ? cut.slice(0, end + 1) : cutWords(plain, max);
}
