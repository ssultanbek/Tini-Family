// Tina's per-turn inspection: scan -> Finding objects (with words) -> events.
// "full" mode emits the whole walk as the brief describes; "crew" mode fits today's
// project.ts (which emits started / red / green / finished itself) and adds only
// tina.inspect.segment and finding.cleared.
import type { Finding, FixOption } from "../../../shared/events.ts";
import type { CrewCtx } from "../crew.ts";
import type { Staged } from "../tini/stager.ts";
import { explain } from "./explain.ts";
import { scanWorkspace, type FindingType, type RawFinding, type ScanResult } from "./scan.ts";

export type TinaCtx = Pick<CrewCtx, "emit" | "log" | "ai" | "state">;

export const FIXES: Record<FindingType, FixOption[]> = {
  "api-key": [{ id: "move-key-out", label: "Move the key out of the website" }, { id: "remove-file", label: "Remove this file" }],
  "photo-metadata": [{ id: "strip-metadata", label: "Remove the hidden details" }, { id: "remove-photo", label: "Remove this photo" }],
  "personal-data": [{ id: "remove-file", label: "Remove this file" }],
  "risky-file": [{ id: "remove-file", label: "Remove this file" }],
};

export async function toFinding(ai: TinaCtx["ai"], raw: RawFinding): Promise<Finding> {
  const words = await explain(ai, raw);
  return {
    id: raw.id,
    segmentId: raw.segmentId,
    severity: raw.severity,
    title: words.title,
    explanation: `${words.explanation} Found in ${raw.file} (${raw.detail}).`,
    file: raw.file,
    fixes: FIXES[raw.type],
  };
}

export const DATA_LEAVES_PREFIX = "data leaves to: ";

export interface InspectionResult { findings: Finding[]; cleared: string[]; redSegments: string[]; scan: ScanResult }
export interface InspectionOptions { mode?: "full" | "crew" }

export async function runInspection(ctx: TinaCtx, staged: Staged, previousFindings: Finding[], opts: InspectionOptions = {}): Promise<InspectionResult> {
  const full = (opts.mode ?? "full") === "full";
  const segments = ctx.state().segments;
  if (full) ctx.emit({ actor: "tina", type: "tina.inspect.started", scope: "final" });

  const scan = await scanWorkspace(staged, { segmentIds: segments.map((s) => s.id) });
  const findings = await Promise.all(scan.findings.map((r) => toFinding(ctx.ai, r)));
  ctx.log("scan", `Tina checked ${scan.scope.length} output file(s) in ${scan.ms}ms (secrets via ${scan.secretEngine}): ${findings.length ? findings.map((f) => `${f.segmentId}/${f.file}`).join(", ") : "nothing found"}`);
  ctx.log("scan", `${DATA_LEAVES_PREFIX}${scan.dataLeavesTo.length ? scan.dataLeavesTo.join(", ") : "nothing"}`);

  const red = new Set<string>();
  for (const s of segments) {
    ctx.emit({ actor: "tina", type: "tina.inspect.segment", segmentId: s.id });
    const mine = findings.filter((f) => f.segmentId === s.id);
    if (mine.length) red.add(s.id);
    if (!full) continue;
    if (mine.length) for (const f of mine) ctx.emit({ actor: "tina", type: "segment.red", segmentId: s.id, finding: f });
    else ctx.emit({ actor: "tina", type: "segment.green", segmentId: s.id });
  }
  // A finding on a segment that isn't on the fence (shouldn't happen) still counts.
  for (const f of findings) if (!segments.some((s) => s.id === f.segmentId)) {
    red.add(f.segmentId);
    if (full) ctx.emit({ actor: "tina", type: "segment.red", segmentId: f.segmentId, finding: f });
  }

  const now = new Set(findings.map((f) => f.id));
  const cleared = previousFindings.filter((p) => !now.has(p.id)).map((p) => p.id);
  for (const id of cleared) ctx.emit({ actor: "tina", type: "finding.cleared", findingId: id, reason: "Tina didn't find it on this check: it was changed or removed since the last one." });

  if (full) ctx.emit({ actor: "tina", type: "tina.inspect.finished", scope: "final", redCount: red.size });
  return { findings, cleared, redSegments: [...red], scan };
}
