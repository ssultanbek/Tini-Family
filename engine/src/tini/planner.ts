// Turn-1 fence planning. Code decides WHAT is inside the fence (paths, domains);
// the AI ladder only writes words (labels, purposes, workspace name, extra contract
// lines). Every AI answer is re-validated here, and anything it mentions that code
// didn't find is dropped: the AI can never add access.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { Ask } from "../ai.ts";
import type { Ev } from "../crew.ts";
import type { ContractCard, Segment } from "../../../shared/events.ts";
import { isInside, pretty } from "../guard.ts";
import { detailLine, preinspect, strippedLines, type FolderInspection } from "../tina/preinspect.ts";
import { expandHome, extractDomains, extractPaths, judgePath, outermost, slug } from "./paths.ts";
import { firstWords, wordCount } from "./text.ts";

export const NPM_REGISTRY = "registry.npmjs.org";
export const OUTSIDE_LINE = "Everything else on your Mac stays outside the fence.";

export interface Source { segmentId: string; realPath: string }
export interface Plan {
  segments: Segment[];
  contract: ContractCard;
  sources: Source[];
  allowedDomains: string[];
  workspaceName: string;
  /** Extra detail for the stager and the raw view (additive to the agreed interface). */
  inspections: FolderInspection[];
  planSource: "cache" | "gemini" | "claude" | "fallback";
  dropped: string[];          // what validation removed from the AI answer, for the raw log
}
export interface PlanOptions { emit?: (ev: Ev) => void; log?: (line: string) => void }

export function projectsRoot(): string {
  return path.resolve(process.env.TINI_PROJECTS_DIR || path.join(os.homedir(), "tini-projects"));
}

// ---------------------------------------------------------------------------
// The AI's part: words only
// ---------------------------------------------------------------------------
export const AiPlanSchema = z.object({
  workspaceName: z.string().describe("short lowercase-hyphenated folder name for the new project, e.g. rivera-site"),
  isWebsite: z.boolean().describe("true if the task builds a website or web app"),
  needsPackages: z.boolean().describe("true if Claude will likely need npm packages"),
  segments: z.array(z.object({
    path: z.string().describe("one of the folder paths given in the input, exactly as given"),
    label: z.string().describe("1-2 word label painted on the fence, e.g. Photos"),
    purpose: z.string().describe("one short plain-English line: what Claude will use it for"),
  })),
  contractLines: z.array(z.string()).describe("0-2 short plain-English lines for the contract card, about the listed folders only"),
});
export type AiPlan = z.infer<typeof AiPlanSchema>;

const INSTRUCTIONS = `You are Tini, who builds a fence around an AI coding agent so it only gets what the job needs.
You get the owner's request and the folders code already found in it, with file counts only.
Write friendly, plain-English words for a non-technical owner. Rules:
- One segment per folder in the input, using its path exactly as given. Never add folders.
- Labels are 1-2 words, Title Case (e.g. "Photos", "About", "Sales data").
- Purposes are one short line (at most 7 words).
- workspaceName: 2-4 lowercase words joined by hyphens, naming the project (e.g. "rivera-site").
- contractLines: at most 1 short line, only about the listed folders. No paths or websites that aren't in the input.
Reply with JSON only.`;

const WEBSITE_RE = /\b(web ?sites?|web ?pages?|landing page|home ?page|web ?app|site|portfolio|blog|react|vite|next\.?js|html)\b/i;
const PACKAGES_RE = /\b(npm|node|react|vite|next\.?js|express|typescript|packages?|librar(y|ies)|chart\.?js|d3)\b/i;

// ---------------------------------------------------------------------------
// Validation of AI words
// ---------------------------------------------------------------------------
const clean = (s: string) => s.replace(/[\u0000-\u001f<>`{}]/g, " ").replace(/\s+/g, " ").trim();
const MAX_LINE_WORDS = 12;   // contract lines stay short; AI words that don't fit are dropped, never cut
/** A fence label: at most 3 whole words and 24 characters. */
function fenceLabel(s: string): string {
  const w = firstWords(clean(s).replace(/[^\w &'-]/g, "").trim(), 3).split(" ");
  while (w.length > 1 && w.join(" ").length > 24) w.pop();
  const out = w.join(" ");
  return out.length <= 24 ? out : "";
}
const SENSITIVE_WORDS = /(\.ssh|\.aws|\.gnupg|id_rsa|keychain|password|\.env\b|credential|private key)/i;

/** A line of AI text is kept only if every path and web address in it is one code already allowed. */
export function lineIsSafe(line: string, allowedPaths: string[], allowedDomains: string[], workspace: string): boolean {
  if (SENSITIVE_WORDS.test(line)) return false;
  for (const p of extractPaths(line)) {
    const abs = path.resolve(expandHome(p));
    if (!allowedPaths.some((a) => isInside(abs, a)) && !isInside(abs, workspace)) return false;
  }
  for (const d of extractDomains(line)) if (!allowedDomains.includes(d)) return false;
  return true;
}

function title(s: string) { return s.replace(/[-_]+/g, " ").replace(/\.[a-z0-9]+$/i, "").replace(/\b\w/g, (c) => c.toUpperCase()).trim(); }

function uniqueWorkspaceName(base: string): string {
  const root = projectsRoot();
  let name = base, n = 2;
  while (fs.existsSync(path.join(root, name))) name = `${base}-${n++}`;
  return name;
}

// ---------------------------------------------------------------------------
// planFence
// ---------------------------------------------------------------------------
export async function planFence(prompt: string, ai: Ask, opts: PlanOptions = {}): Promise<Plan> {
  const log = opts.log ?? (() => {});
  const dropped: string[] = [];

  // 1. Code finds and judges every path in the prompt.
  const judged = extractPaths(prompt).map(judgePath);
  const found = outermost(judged.filter((j) => j.ok));
  const refused = judged.filter((j) => !j.ok);

  // 2. Stable slug ids, one segment per folder or file.
  const RESERVED = new Set(["workspace", "web-packages"]);
  const ids = new Set<string>();
  const sources = found.map((f) => {
    let id = slug(path.basename(f.abs)) || "folder";
    if (RESERVED.has(id) || ids.has(id)) id = slug(`${path.basename(path.dirname(f.abs))}-${id}`);
    let n = 2; const base = id;
    while (RESERVED.has(id) || ids.has(id)) id = `${base}-${n++}`;
    ids.add(id);
    return { segmentId: id, abs: f.abs, display: f.display, isDir: f.isDir, fallbackLabel: title(path.basename(f.abs)) };
  });

  // 3. Tina pre-inspects (code only).
  const inspections = await preinspect(sources.map((s) => ({ segmentId: s.segmentId, abs: s.abs, isDir: s.isDir, label: s.fallbackLabel })), opts.emit);

  // 4. The AI writes the words. It sees the prompt and, per folder, the name and counts by type.
  const codeWebsite = WEBSITE_RE.test(prompt);
  const codePackages = codeWebsite || PACKAGES_RE.test(prompt) || sources.some((s) => s.isDir && fs.existsSync(path.join(s.abs, "package.json")));
  const fallback: AiPlan = {
    workspaceName: fallbackName(sources, codeWebsite),
    isWebsite: codeWebsite,
    needsPackages: codePackages,
    segments: sources.map((s) => ({ path: s.display, label: s.fallbackLabel, purpose: s.isDir ? "Files you named for this job" : "The file you named for this job" })),
    contractLines: [],
  };
  const input = {
    request: prompt,
    folders: sources.map((s, i) => ({ path: s.display, kind: s.isDir ? "folder" : "file", fileCounts: inspections[i].counts })),
  };
  const res = await ai({ task: "tini.plan", instructions: INSTRUCTIONS, input, schema: AiPlanSchema, fallback, cache: process.env.TINI_AI_CACHE !== "off" });
  log(`tini.plan answered by ${res.source} (${res.trail})`);

  // 5. Re-validate. Never trust the shape, and never let it add access.
  const parsed = AiPlanSchema.safeParse(res.value);
  const aiPlan = parsed.success ? parsed.data : fallback;
  if (!parsed.success) dropped.push("whole AI answer (invalid shape)");

  const bySource = new Map<string, { label: string; purpose: string }>();
  for (const s of aiPlan.segments) {
    const abs = path.resolve(expandHome(s.path.trim()));
    const match = sources.find((src) => src.abs === abs || src.display === s.path.trim());
    if (!match) { dropped.push(`segment for ${s.path} (not a folder code found)`); continue; }
    if (bySource.has(match.segmentId)) continue;
    const label = fenceLabel(s.label);
    let purpose = clean(s.purpose).replace(/\.$/, "");
    const safe = lineIsSafe(`${label} ${purpose}`, sources.map((x) => x.abs), [], "/nonexistent");
    if (!safe) { dropped.push(`words for ${s.path} (mentioned something outside the fence)`); purpose = ""; }
    bySource.set(match.segmentId, { label: safe && label ? label : match.fallbackLabel, purpose });
  }

  // Access decisions: code only. Packages can be switched on by code or AI (a fixed, visible
  // segment on the card); domains are the npm registry plus domains Maria typed herself.
  const needsPackages = codePackages || aiPlan.needsPackages === true;
  const allowedDomains = [...new Set([...(needsPackages ? [NPM_REGISTRY] : []), ...extractDomains(prompt)])];

  let wsBase = slug(aiPlan.workspaceName, 32);
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(wsBase)) { dropped.push(`workspace name "${aiPlan.workspaceName}"`); wsBase = fallback.workspaceName; }
  const workspaceName = uniqueWorkspaceName(wsBase);
  const workspaceDisplay = pretty(path.join(projectsRoot(), workspaceName));

  // 6. Segments.
  const segments: Segment[] = sources.map((s, i) => ({
    id: s.segmentId,
    label: bySource.get(s.segmentId)?.label ?? s.fallbackLabel,
    kind: "folder",
    detail: detailLine(inspections[i]),
    status: "planned",
  }));
  if (needsPackages) segments.push({ id: "web-packages", label: "Web packages", kind: "packages", detail: "npm registry only", status: "planned" });
  segments.push({ id: "workspace", label: "Workspace", kind: "workspace", detail: workspaceDisplay, status: "planned" });

  // 7. The contract card.
  const allowed: string[] = sources.map((s) => {
    const words = bySource.get(s.segmentId);
    const label = words?.label ?? s.fallbackLabel;
    const base = `${label}: copies of ${s.display}`;
    const withPurpose = words?.purpose ? `${base} (${words.purpose})` : base;
    if (withPurpose !== base && wordCount(withPurpose) > MAX_LINE_WORDS) dropped.push(`purpose for ${s.display} (too long for the card)`);
    return wordCount(withPurpose) <= MAX_LINE_WORDS ? withPurpose : base;
  });
  if (needsPackages) allowed.push(`Web packages from the npm registry (${NPM_REGISTRY})`);
  const typedDomains = allowedDomains.filter((d) => d !== NPM_REGISTRY);
  if (typedDomains.length) allowed.push(`Websites you named: ${typedDomains.join(", ")}`);
  allowed.push(`A fresh project folder: ${workspaceDisplay}`);
  for (const line of aiPlan.contractLines.slice(0, 1)) {
    const l = clean(line);
    if (!l) continue;
    if (wordCount(l) > MAX_LINE_WORDS) { dropped.push(`contract line "${l}" (too long)`); continue; }
    if (lineIsSafe(l, sources.map((x) => x.abs), allowedDomains, path.join(projectsRoot(), workspaceName))) allowed.push(l);
    else dropped.push(`contract line "${l}"`);
  }

  const stripped = strippedLines(inspections, pretty);
  for (const r of refused) {
    if (r.ok) continue;
    stripped.push(r.why === "sensitive" ? `Tini won't give Claude access to ${r.display} (${r.reason})` : `Couldn't find ${r.raw}, so it isn't included`);
  }

  for (const d of dropped) log(`tini.plan validation dropped: ${d}`);
  return {
    segments,
    contract: { title: "Here's what Claude can use for this job", allowed, stripped, outside: OUTSIDE_LINE },
    sources: sources.map((s) => ({ segmentId: s.segmentId, realPath: s.abs })),
    allowedDomains,
    workspaceName,
    inspections,
    planSource: res.source,
    dropped,
  };
}

function fallbackName(sources: { abs: string; isDir: boolean }[], website: boolean): string {
  const suffix = website ? "site" : "work";
  if (!sources.length) return `new-${suffix}`;
  const parents = new Set(sources.map((s) => path.dirname(s.abs)));
  const base = parents.size === 1 && sources.length > 1 ? path.basename([...parents][0]) : path.basename(sources[0].abs);
  return `${slug(base, 24) || "project"}-${suffix}`;
}
