// The access report: a pure function over the event log, so a live run and its
// replay produce the same report. Every line is tagged with the turn it happened in.
import type { AccessReport, EngineEvent, Finding, ReportLine, Segment } from "../../shared/events.ts";
import type { Ev } from "./crew.ts";
import { DATA_LEAVES_PREFIX } from "./tina/findings.ts";

type E = EngineEvent | Ev;
const tag = (why: string, turn: number) => `${why} (turn ${turn})`;

export function buildReport(events: readonly E[]): AccessReport {
  const allowed: ReportLine[] = [], blocked: ReportLine[] = [], narrowed: ReportLine[] = [], fixed: ReportLine[] = [];
  let dataLeavesTo: string[] = [];
  let turn = 1;
  let proposed: { segments: Segment[]; stripped: string[] } | null = null;
  const openEsc = new Map<string, { requested: string; source?: string; labels: Map<string, string>; details: Map<string, string> }>();
  const findings = new Map<string, Finding>();
  const seenBlocked = new Set<string>();
  const addBlocked = (what: string, why: string) => {
    const key = `${what}|${why}`;
    if (seenBlocked.has(key)) return;
    seenBlocked.add(key);
    blocked.push({ what, why: tag(why, turn) });
  };

  for (const e of events) {
    switch (e.type) {
      case "session.reset":
        allowed.length = blocked.length = narrowed.length = fixed.length = 0;
        dataLeavesTo = []; turn = 1; proposed = null; openEsc.clear(); findings.clear(); seenBlocked.clear();
        break;
      case "turn.started": turn = e.turnId; break;
      case "fence.plan.proposed": proposed = { segments: e.segments, stripped: e.contract.stripped }; break;
      case "fence.plan.approved":
        for (const s of proposed?.segments ?? []) {
          if (s.kind === "folder") allowed.push({ what: `${s.label}: ${s.detail}`, why: tag("You named it in your request", turn) });
          else if (s.kind === "packages") allowed.push({ what: "npm registry (web packages)", why: tag("Packages for the job", turn) });
          else if (s.kind === "workspace") allowed.push({ what: `Project folder ${s.detail}`, why: tag("Claude's workspace for this project", turn) });
          else if (s.kind === "network") allowed.push({ what: s.label, why: tag(s.detail, turn) });
        }
        for (const line of proposed?.stripped ?? []) {
          if (/^Tini won't give Claude access to /.test(line)) blocked.push({ what: line.replace(/^Tini won't give Claude access to /, "").replace(/ \(.*\)$/, ""), why: tag("Private: kept out from the start", turn) });
          else if (/^Couldn't find /.test(line)) continue;
          else narrowed.push({ what: line.replace(/,? removed before Claude sees them$/, "").replace(/^Left out /, "").replace(/: it .*$/, ""), why: tag(/GPS/.test(line) ? "Locations removed before Claude saw them" : line.replace(/^Left out [^:]+: /, "Left out: "), turn) });
        }
        break;
      case "fence.blocked":
        addBlocked(e.target, e.simulated ? `${e.reason} [simulated attack]` : e.reason);
        break;
      case "escalation.opened":
        openEsc.set(e.escalationId, {
          requested: e.requested, source: e.source,
          labels: new Map(e.options.map((o) => [o.id, o.label])), details: new Map(e.options.map((o) => [o.id, o.detail])),
        });
        break;
      case "escalation.resolved": {
        const o = openEsc.get(e.escalationId);
        const what = o?.requested ?? e.escalationId;
        const asker = o?.source === "prompt" ? "Your request" : "Claude";
        if (e.choice === "narrow") narrowed.push({ what, why: tag(`${asker} asked; you allowed only part: ${o?.labels.get("narrow")?.replace(/^Allow (only )?/, "") ?? e.summary}. ${o?.details.get("narrow") ?? ""}`.trim(), turn) });
        else if (e.choice === "all") allowed.push({ what, why: tag(`${asker} asked; you allowed the whole folder`, turn) });
        else addBlocked(what, `${asker} asked; ${/stopped/i.test(e.summary) ? "the turn was stopped" : "you said no"}`);
        break;
      }
      case "segment.red": findings.set(e.finding.id, e.finding); break;
      case "fix.applied": {
        const f = findings.get(e.findingId);
        fixed.push({ what: f ? `${f.title}${f.file ? ` (${f.file})` : ""}` : e.findingId, why: tag(e.summary, turn) });
        break;
      }
      case "finding.cleared": {
        const f = findings.get(e.findingId);
        fixed.push({ what: f ? `${f.title}${f.file ? ` (${f.file})` : ""}` : e.findingId, why: tag(`Gone without a fix click: ${e.reason}`, turn) });
        break;
      }
      case "raw.log":
        if (e.channel === "scan" && e.text.startsWith(DATA_LEAVES_PREFIX)) {
          const rest = e.text.slice(DATA_LEAVES_PREFIX.length).trim();
          dataLeavesTo = rest === "nothing" ? [] : rest.split(/,\s*/).filter(Boolean);
        }
        break;
    }
  }
  return { allowed, blocked, narrowed, fixed, dataLeavesTo };
}

/** Reads a recording (engine/recordings/*.jsonl) into its events. */
export function eventsFromRecording(jsonl: string): EngineEvent[] {
  const out: EngineEvent[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (r.kind === "event" && r.event) out.push(r.event); } catch { /* skip a torn line */ }
  }
  return out;
}
