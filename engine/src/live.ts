// --mode live: the real crew, assembled piece by piece.
//   Tini (Stage 3): planFence / stageFence / checkAccess / rewritePrompt
//   Dog  (Stage 4): runner.ts, one Claude session across turns, plus the request door
//   Escalation + harness (Stage 5): createEscalation, simulateAttack
//   Tina (Stages 6-7): runInspection / applyFix in crew mode, buildReport, launch
import type { Crew, CrewCtx } from "./crew.ts";
import { simulateAttack } from "./harness.ts";
import { isWebsite, openInFinder, serveSite, stopSite } from "./launcher.ts";
import { buildReport } from "./report.ts";
import { DogRunner } from "./runner.ts";
import { resetExplanations } from "./tina/explain.ts";
import { runInspection } from "./tina/findings.ts";
import { applyFix } from "./tina/fixes.ts";
import { checkAccess, createEscalation, planFence, rewritePrompt, stageFence, type Plan, type Staged } from "./tini/index.ts";

const STATIC_SITE = "Keep it a simple static site: HTML, CSS and JavaScript, no build tools. Don't start a local server or open a browser to preview it: Tini launches the site after Tina's check.";

// The request door, replacing Stage 3's "say so in one sentence" line in the fence note.
export const REQUEST_LINE = "Everything you were given is in ./assets. If you need a file or folder outside this workspace, don't try to open it: call request_access with the path and a one-line reason, then keep working.";
export function withRequestDoor(fenceNote: string): string {
  const lines = fenceNote.split("\n");
  const i = lines.findIndex((l) => /^If you truly need something outside the fence/.test(l));
  if (i >= 0) lines[i] = REQUEST_LINE; else lines.push(REQUEST_LINE);
  return lines.join("\n");
}

export interface LiveOptions { turnBudgetUsd?: number; sessionBudgetUsd?: number; demo?: boolean }

/** Tina's side, shared by live and observe: inspect, fix, launch (+ the report), on whatever is staged. */
export function tinaCrew(getStaged: () => Staged | null, isSite: () => boolean): Pick<Crew, "inspect" | "fix" | "launch"> {
  const need = () => { const s = getStaged(); if (!s) throw new Error("no workspace yet"); return s; };
  return {
    async inspect(ctx) {
      const r = await runInspection(ctx, need(), ctx.state().findings, { mode: "crew" });
      return r.findings;
    },
    async fix(ctx, finding, fixId) {
      return (await applyFix(ctx, need(), finding.id, fixId, { mode: "crew" })).summary;
    },
    async launch(ctx) {
      const staged = need();
      const report = buildReport(ctx.events?.() ?? []);
      if (isSite() || isWebsite(staged.workspace)) {
        const url = await serveSite(staged.workspace);
        ctx.log("config", `launched: ${staged.workspace} served at ${url}`);
        return { url, report };
      }
      await openInFinder(staged.workspace);
      ctx.log("config", `launched: opened ${staged.workspace} in Finder`);
      return { report };
    },
  };
}
export type LiveCrew = Crew & { attack(ctx: CrewCtx): string };

export function liveCrew(opts: LiveOptions = {}): LiveCrew {
  let staged: Staged | null = null;
  let runner: DogRunner | null = null;
  let website = false;
  let attacked = false;
  const escalation = createEscalation({ getStaged: () => staged, agentReason: (p) => runner?.agentReason(p) });
  const tina = tinaCrew(() => staged, () => website);

  const attack = (ctx: CrewCtx): string => {
    if (!staged) return "no fence yet: approve a plan first";
    const d = simulateAttack(ctx, staged);
    return d.allow ? "the fence ALLOWED the simulated read (check the fence config)" : "blocked";
  };

  return {
    attack,
    reset() { runner?.close(); runner = null; staged = null; website = false; attacked = false; escalation.reset(); resetExplanations(); void stopSite(); },

    async plan(ctx, prompt, adjustments) {
      const full = [prompt, ...adjustments].join("\n");
      website = /\b(web ?site|landing page|web ?page|homepage)\b/i.test(full);
      return planFence(full, ctx.ai, { emit: ctx.emit, log: (l) => ctx.log("scan", l) });
    },

    async stage(ctx, plan) {
      staged = await stageFence(plan as Plan, ctx.emit);
      ctx.log("config", `workspace ${staged.workspace}; allowedDomains=${JSON.stringify(staged.fence.allowedDomains)}; pathMap=${JSON.stringify(staged.pathMap)}`);
      runner = new DogRunner({
        fence: staged.fence,
        fenceNote: withRequestDoor(staged.fenceNote),
        rewrite: (t) => rewritePrompt(t, staged!.pathMap),
        turnBudgetUsd: opts.turnBudgetUsd,
        sessionBudgetUsd: opts.sessionBudgetUsd,
        // --demo: the template attack fires once, in turn 1, after the 4th brick (labelled simulated).
        onBrick: (ctx) => {
          const s = ctx.state();
          if (opts.demo && !attacked && s.turns.length === 1 && s.bricks >= 4) { attacked = true; attack(ctx); }
        },
      });
    },

    async access(ctx, text) {
      if (!staged) return [];
      const r = checkAccess(text, staged);
      for (const s of r.sensitive) {
        ctx.emit({ actor: "tini", type: "fence.blocked", target: s, tool: "Prompt", layer: "hook", simulated: false,
          reason: `Your request mentions ${s}. That's private, so it stays outside the fence.` });
      }
      return r.newFolders;
    },

    inspectRequest: (ctx, requested, source) => escalation.inspectRequest(ctx, requested, source),
    applyEscalation: (ctx, esc, choice) => escalation.applyEscalation(ctx, esc, choice),

    async runTurn(ctx, message, info) {
      if (!runner) throw new Error("the dog has no fence yet (stage() didn't run)");
      const text = website && !info.followUp ? `${message}\n\n${STATIC_SITE}` : message;
      return runner.runTurn(ctx, text);
    },

    ...tina,
  };
}
