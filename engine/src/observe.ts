// --mode observe: the 20-second "without the guardian" clip. No staging, no request door:
// Claude gets Maria's real paths, and the hook logs every outside access but ALLOWS it,
// then Tina scans what Claude built to show what would have shipped. Same events, same game.
//
// Two lines we never cross, even here:
// - the always-private list (isSensitive: ~/.ssh, ~/.aws, keychains, .env, .npmrc, ...) stays
//   blocked by the hook AND by the OS sandbox (narrower denyRead inside the read roots);
// - it reads only the demo folders (OBSERVE_ROOTS), never the rest of the owner's real home,
//   and writes only its workspace (originals are never modified).
import fs from "node:fs";
import path from "node:path";
import type { Segment } from "../../shared/events.ts";
import type { Crew, CrewCtx } from "./crew.ts";
import type { Decide, DogPolicy } from "./dog.ts";
import { bashPaths, checkNetwork, checkPath, checkTool, checkToolCall, expandHome, isInside, pretty, realish, type Fence, type GuardDecision } from "./guard.ts";
import { tinaCrew } from "./live.ts";
import { stopSite } from "./launcher.ts";
import { DogRunner } from "./runner.ts";
import { resetExplanations } from "./tina/explain.ts";
import { walk } from "./tina/preinspect.ts";
import { isSensitive, projectsRoot, type Staged } from "./tini/index.ts";

/** The demo folders observe mode may read (the demo kit's targets, minus ~/tini-demo). */
export const OBSERVE_ROOTS = ["~/Clients", "~/Pictures/Jobsite2024", "~/Documents/Rivera-HR"];
const STATIC_SITE = "Keep it a simple static site: HTML, CSS and JavaScript, no build tools. Don't start a local server or open a browser to preview it.";

/**
 * Observe policy: tools and network rules are unchanged; a path outside the workspace is
 * allowed (and logged) when it's a READ inside the demo roots and not private.
 */
export function observeDecide(fence: Fence, roots: string[], log: (line: string) => void = () => {}): Decide {
  const rootAbs = roots.map((r) => realish(expandHome(r)));
  const judge = (raw: string, cwd: string, write: boolean): GuardDecision => {
    const d = checkPath(raw, cwd, fence);
    if (d.allow || d.kind !== "path") return d;
    const abs = realish(path.resolve(cwd, expandHome(raw)));
    if (isSensitive(abs)) return { allow: false, kind: "path", target: pretty(abs), reason: `${pretty(abs)} is private. It stays blocked even without a fence.` };
    if (write) return { allow: false, kind: "path", target: pretty(abs), reason: `Observe mode never changes the owner's real files (${pretty(abs)}).` };
    if (!rootAbs.some((r) => isInside(abs, r))) return { allow: false, kind: "path", target: pretty(abs), reason: `${pretty(abs)} isn't one of the demo folders.` };
    log(`OBSERVE allow ${pretty(abs)} (Tini's fence would have blocked this)`);
    return { allow: true };
  };
  return (tool, input, cwd) => {
    const t = checkTool(tool);
    if (!t.allow) return t;
    if (tool === "Bash") {
      const command = String(input.command ?? "");
      for (const p of bashPaths(command)) { const d = judge(p, cwd, false); if (!d.allow) return d; }   // the OS sandbox stops Bash writes outside
      return checkNetwork(command, fence);
    }
    if (tool === "Read" || tool === "Write" || tool === "Edit") return judge(String(input.file_path ?? ""), cwd, tool !== "Read");
    if (tool === "Glob" || tool === "Grep") {
      const d = judge(String(input.path ?? cwd), cwd, false);
      if (!d.allow) return d;
      const root = String(input.pattern ?? "").split(/[*?[{]/)[0];
      return tool === "Glob" && (root.startsWith("/") || root.startsWith("~") || root.includes("..")) ? judge(root || "/", String(input.path ?? cwd), false) : d;
    }
    return checkToolCall(tool, input, cwd, fence);   // everything else: the normal rules (other tools refused)
  };
}

/** The sandbox side: read the demo roots, but never the private files inside them. */
export function observePolicy(fence: Fence, roots: string[], log?: (line: string) => void): DogPolicy {
  const privateInside: string[] = [];
  for (const r of roots) {
    const abs = expandHome(r);
    if (!fs.existsSync(abs)) continue;
    for (const rel of walk(abs, true).files) if (isSensitive(path.join(abs, rel))) privateInside.push(path.join(abs, rel));
  }
  return { decide: observeDecide(fence, roots, log), extraRead: roots, denyRead: privateInside };
}

export function observeCrew(opts: { turnBudgetUsd?: number; sessionBudgetUsd?: number } = {}): Crew {
  let staged: Staged | null = null;
  let runner: DogRunner | null = null;
  let website = false;
  const tina = tinaCrew(() => staged, () => website);
  const seg = (id: string, label: string, kind: Segment["kind"], detail: string): Segment => ({ id, label, kind, detail, status: "planned" });

  return {
    reset() { runner?.close(); runner = null; staged = null; website = false; resetExplanations(); void stopSite(); },

    async plan(ctx, prompt, adjustments) {
      website = /\b(web ?site|landing page|web ?page|homepage)\b/i.test([prompt, ...adjustments].join("\n"));
      ctx.say("tini", "Observe mode: no fence this time. I'll just watch.");
      return {
        segments: [seg("workspace", "Workspace", "workspace", "a fresh folder, nothing copied in"), seg("web-packages", "Web packages", "packages", "not fenced")],
        contract: {
          title: "Observe mode: no fence",
          allowed: ["Claude works directly on your real folders", "Nothing is copied or cleaned first"],
          stripped: [],
          outside: "Only keys and passwords stay blocked (SSH, cloud keys, keychains, .env, .npmrc), even in this demo.",
        },
      };
    },

    async stage(ctx, plan) {
      const root = projectsRoot();
      fs.mkdirSync(root, { recursive: true });
      const workspace = realish(fs.mkdtempSync(path.join(root, "observe-")));
      const fence: Fence = { workspace, allowedDomains: [] };
      staged = { fence, workspace, pathMap: {}, fenceNote: "" };
      for (const g of plan.segments) ctx.emit({ actor: "tini", type: "fence.segment.built", segment: g });
      const policy = observePolicy(fence, OBSERVE_ROOTS, (l) => { try { ctx.log("hook", l); } catch { /* stale */ } });
      ctx.log("config", `observe: workspace ${workspace}; reads allowed in ${OBSERVE_ROOTS.join(", ")}; private files denied by the sandbox: ${policy.denyRead?.length ?? 0}`);
      runner = new DogRunner({
        fence, fenceNote: `You are working in ${workspace}. Put everything you build there.`,
        policy, requestDoor: false,
        turnBudgetUsd: opts.turnBudgetUsd, sessionBudgetUsd: opts.sessionBudgetUsd,
      });
    },

    async access() { return []; },   // no fence, so nothing is ever "new"
    async inspectRequest() { throw new Error("observe mode has no escalations"); },
    async applyEscalation() { return {}; },

    async runTurn(ctx: CrewCtx, message, info) {
      if (!runner) throw new Error("observe: stage() didn't run");
      return runner.runTurn(ctx, website && !info.followUp ? `${message}\n\n${STATIC_SITE}` : message);
    },

    ...tina,
  };
}

