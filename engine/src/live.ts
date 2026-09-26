// --mode live: the real crew, assembled piece by piece.
//   Tini (Stage 3): planFence / stageFence / checkAccess / rewritePrompt
//   Dog  (Stage 4): runner.ts, one Claude session across turns
//   Stand-ins until Stages 5-7: escalation inspection, per-turn inspection, fixes, launch.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Ask } from "./ai.ts";
import type { Crew, CrewCtx, Ev, FencePlan } from "./crew.ts";
import { expandHome, type Fence } from "./guard.ts";
import { DogRunner } from "./runner.ts";
import { folderSlug, standinCrew } from "./standins.ts";

/** The Stage 3 interface (engine/src/tini/index.ts), typed structurally. */
export interface Staged { fence: Fence; workspace: string; pathMap: Record<string, string>; fenceNote: string }
export interface TiniApi {
  planFence(prompt: string, ai: Ask, opts?: { emit?: (ev: Ev) => void; log?: (line: string) => void }): Promise<FencePlan>;
  stageFence(plan: FencePlan, emit: (ev: Ev) => void): Promise<Staged>;
  checkAccess(prompt: string, staged: Staged): { newFolders: string[]; sensitive: string[] };
  rewritePrompt(prompt: string, pathMap: Record<string, string>): string;
}

const STATIC_SITE = "Keep it a simple static site: HTML, CSS and JavaScript, no build tools. Don't start a local server or open a browser to preview it: Tini launches the site after Tina's check.";

export function liveCrew(tini: TiniApi, opts: { speed?: number; turnBudgetUsd?: number; sessionBudgetUsd?: number } = {}): Crew {
  const stand = standinCrew(opts.speed ?? 1);
  let staged: Staged | null = null;
  let runner: DogRunner | null = null;
  let website = false;

  return {
    reset() { runner?.close(); runner = null; staged = null; website = false; stand.reset?.(); },

    async plan(ctx, prompt, adjustments) {
      const full = [prompt, ...adjustments].join("\n");
      website = /\b(web ?site|landing page|web ?page|homepage)\b/i.test(full);
      return tini.planFence(full, ctx.ai, { emit: ctx.emit, log: (l) => ctx.log("scan", l) });
    },

    async stage(ctx, plan) {
      staged = await tini.stageFence(plan, ctx.emit);
      ctx.log("config", `workspace ${staged.workspace}; allowedDomains=${JSON.stringify(staged.fence.allowedDomains)}; pathMap=${JSON.stringify(staged.pathMap)}`);
      runner = new DogRunner({
        fence: staged.fence,
        fenceNote: staged.fenceNote,
        rewrite: (t) => tini.rewritePrompt(t, staged!.pathMap),
        turnBudgetUsd: opts.turnBudgetUsd,
        sessionBudgetUsd: opts.sessionBudgetUsd,
      });
    },

    async access(ctx, text) {
      if (!staged) return [];
      const r = tini.checkAccess(text, staged);
      for (const s of r.sensitive) {
        ctx.emit({ actor: "tini", type: "fence.blocked", target: s, tool: "Prompt", layer: "hook", simulated: false,
          reason: `Your request mentions ${s}. That's private, so it stays outside the fence.` });
      }
      return r.newFolders;
    },

    inspectRequest: (ctx, requested, source) => stand.inspectRequest(ctx, requested, source),

    async applyEscalation(ctx, esc, choice) {
      const r = await stand.applyEscalation(ctx, esc, choice);        // card-side events (Stage 5 replaces)
      if (choice === "deny" || !staged) return r;
      const id = folderSlug(esc.requested);
      const n = await copyApproved(esc.requested, path.join(staged.workspace, "assets", id), choice === "narrow");
      staged.pathMap[esc.requested] = `./assets/${id}`;                // later prompts see it as inside the fence
      ctx.log("scan", `copied ${n} file(s) from ${esc.requested} to ./assets/${id}/ (${choice}; GPS removed)`);
      return { note: `Approved files are now in ./assets/${id}/.` };
    },

    async runTurn(ctx, message, info) {
      if (!runner) throw new Error("the dog has no fence yet (stage() didn't run)");
      const text = website && !info.followUp ? `${message}\n\n${STATIC_SITE}` : message;
      return runner.runTurn(ctx, text);
    },

    inspect: (ctx, segments) => stand.inspect(ctx, segments),
    fix: (ctx, finding, fixId) => stand.fix(ctx, finding, fixId),
    launch: (ctx: CrewCtx) => stand.launch(ctx),
  };
}

/**
 * TEMPORARY until Stage 5's escalation pipeline: copy the approved folder in, GPS removed.
 * "narrow" keeps names that look like the job (not personal IMG_ photos, scans or logins).
 */
async function copyApproved(requested: string, dest: string, narrow: boolean): Promise<number> {
  const src = expandHome(requested);
  fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(src, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith("."));
  const pick = narrow ? files.filter((e) => !/^IMG_\d+|scan_|login|password|secret|credential/i.test(e.name)) : files;
  for (const e of pick) fs.copyFileSync(path.join(src, e.name), path.join(dest, e.name));
  if (pick.some((e) => /\.jpe?g$/i.test(e.name))) {
    await new Promise<void>((resolve) => execFile("exiftool", ["-q", "-overwrite_original", "-gps:all=", "-xmp:gps*=", "-ext", "jpg", "-ext", "jpeg", dest], () => resolve()));
  }
  return pick.length;
}
