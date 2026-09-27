// One escalation pipeline for both sources: Claude asking for a folder mid-turn
// ("agent"), or Maria's new prompt naming one ("prompt"). Tina inspects locally;
// the AI ladder (task "tina.subset") only suggests which files match the request,
// from names and a metadata summary. Code intersects that suggestion with the real,
// unflagged files: the AI can never add a file, and flagged files never go in "narrow".
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { EscalationOption, InspectionHighlight } from "../../../shared/events.ts";
import type { Choice, CrewCtx, EscalationCard, EscalationSource, OpenEscalation } from "../crew.ts";
import { pretty } from "../guard.ts";
import { stripGpsBatch } from "../tina/exif.ts";
import { flagNoun, inspectFolder, type FolderReport } from "../tina/inspect-folder.ts";
import { kindOf } from "../tina/preinspect.ts";
import { judgePath, slug } from "./paths.ts";
import { clip } from "./text.ts";
import { recordBaseline, type Staged } from "./stager.ts";

export interface EscalationDeps {
  /** The current project's staged fence (null before Approve). */
  getStaged(): Staged | null;
  /** Claude's own words for why it asked, if the runner captured them. */
  agentReason?(requested: string): string | undefined;
}
/** Structurally a Crew applyEscalation result ({ note? }), plus where the files went. */
export interface EscalationApplied { note?: string; segmentId?: string; assetsPath?: string; fileCount?: number }

interface Pending { report: FolderReport; subset: string[]; noun: string; otherNoun: string; subsetBy: string }

const fmt = (n: number) => n.toLocaleString("en-US");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// The subset: AI suggestion, sanitized by code; code fallback
// ---------------------------------------------------------------------------
export const SubsetSchema = z.object({
  includeAll: z.boolean().describe("true only if every listed file fits the request"),
  include: z.array(z.string()).describe("file names (exactly as listed) that the request needs"),
  noun: z.string().describe("max 5 words naming the included files, e.g. 'job-site photos'. No paths."),
  otherNoun: z.string().describe("max 5 words naming the photos left out, e.g. 'personal photos'. No paths."),
});
export type SubsetAnswer = z.infer<typeof SubsetSchema>;

const SUBSET_INSTRUCTIONS = `You are Tina, who protects the owner's private files from an AI coding agent.
Someone wants files from one folder for a project. Pick ONLY the files the request actually needs,
using the file names, the folder structure and the summary. Leave out personal photos, IDs, scans,
and anything that looks private or unrelated to the project. Never invent file names.
noun: 2-3 generic words naming what you picked, with no company or people names (e.g. "job-site photos",
"job descriptions"). otherNoun: 2-3 generic words naming the photos you left out (e.g. "personal photos").
No paths. Reply with JSON only.`;

const STOP = new Set(("the and with from this that these those some more make build site website page pages using use need needs want wants please into also " +
  "add adds for them their your you our its are was were have has will would could should folder folders file files photo photos image images picture pictures " +
  "img jpg jpeg png pdf heic doc docs documents document new modern serious looking info information company about only just like").split(" "));

function words(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 4 || /^\d+$/.test(w) || STOP.has(w)) continue;
    out.add(w.replace(/s$/, ""));
  }
  return out;
}
const fileWords = (rel: string) => [...words(rel.replace(/\.[a-z0-9]+$/i, ""))];

const CAMERA_ROLL = /^(IMG|DSC|DSCN|DSCF|PXL|MVIMG|PHOTO|IMAGE|P)[_ -]?\d+/i;

function kindNoun(rels: string[]): string {
  if (rels.length && rels.every((f) => kindOf(f) === "image")) return "photos";
  if (rels.length && rels.every((f) => kindOf(f) === "document")) return "documents";
  return "files";
}
function otherPhotosNoun(rest: string[]): string {
  const imgs = rest.filter((f) => kindOf(f) === "image");
  if (!imgs.length) return "other photos";
  const roll = imgs.filter((f) => CAMERA_ROLL.test(path.basename(f))).length;
  return roll / imgs.length >= 0.8 ? "personal photos" : "other photos";
}

/** Code-only subset: file names that share a word with the request or project, else everything unflagged. */
export function fallbackSubset(candidates: string[], contextText: string): { subset: string[]; noun: string; by: string } {
  const want = words(contextText);
  const hits = new Map<string, number>();
  const subset = candidates.filter((f) => {
    const w = fileWords(f).find((x) => want.has(x));
    if (w) hits.set(w, (hits.get(w) ?? 0) + 1);
    return !!w;
  });
  if (subset.length) {
    const top = [...hits].sort((a, b) => b[1] - a[1])[0][0];
    return { subset, noun: `${cap(top)} ${kindNoun(subset)}`, by: `name match "${[...hits.keys()].join('", "')}"` };
  }
  return { subset: [...candidates], noun: kindNoun(candidates), by: "all unflagged files" };
}

// Code-written segment labels, at most 3 whole words: "Job-site photos", "HR documents".
const COMPOUNDS: Record<string, string> = { jobsite: "Job-site", worksite: "Work-site" };
function folderWord(root: string): string {
  const parts = path.basename(root).replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z]+/).filter((w) => w.length >= 2);
  const w = parts[parts.length - 1] ?? "";
  if (!w) return "";
  if (COMPOUNDS[w.toLowerCase()]) return COMPOUNDS[w.toLowerCase()];
  return w === w.toUpperCase() ? w : cap(w.toLowerCase());
}
export function segmentLabel(root: string, files: string[]): string {
  const word = folderWord(root);
  const kind = kindNoun(files);
  return word ? `${word} ${kind}` : cap(kind);
}

const NOUN_OK = /^[A-Za-z][A-Za-z '’-]*$/;
function cleanNoun(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  if (!t || t.length > 40 || !NOUN_OK.test(t) || t.split(" ").length > 5) return null;
  return t.toLowerCase();
}

/**
 * Sanitizes an AI subset answer against the real candidate files. Only exact relative
 * names (or a unique base name) of unflagged files survive; absolute paths, "..", "~",
 * anything flagged and anything that doesn't exist are dropped.
 */
export function sanitizeSubset(answer: unknown, candidates: string[]): { subset: string[]; noun: string | null; otherNoun: string | null; dropped: string[] } {
  const parsed = SubsetSchema.safeParse(answer);
  if (!parsed.success) return { subset: [], noun: null, otherNoun: null, dropped: ["whole answer (invalid shape)"] };
  const a = parsed.data;
  const cand = new Set(candidates);
  const byBase = new Map<string, string[]>();
  for (const c of candidates) byBase.set(path.basename(c), [...(byBase.get(path.basename(c)) ?? []), c]);
  const dropped: string[] = [];
  const picked = new Set<string>();
  if (a.includeAll) candidates.forEach((c) => picked.add(c));
  for (const raw of a.include) {
    const s = String(raw).trim().replace(/^\.\//, "");
    if (!s || path.isAbsolute(s) || s.startsWith("~") || s.split(/[\\/]/).includes("..")) { dropped.push(raw); continue; }
    const rel = path.normalize(s);
    if (cand.has(rel)) { picked.add(rel); continue; }
    const base = byBase.get(rel);
    if (base?.length === 1) { picked.add(base[0]); continue; }
    dropped.push(raw);
  }
  return { subset: candidates.filter((c) => picked.has(c)), noun: cleanNoun(a.noun), otherNoun: cleanNoun(a.otherNoun), dropped };
}

const MAX_AI_FILES = 2500;

async function pickSubset(ctx: CrewCtx, report: FolderReport, request: string, project: string): Promise<Pending> {
  const candidates = report.files.filter((f) => !report.flagged.has(f) && !report.secretNames.has(f));
  const fb = fallbackSubset(candidates, `${request}\n${project}`);
  const restOf = (subset: string[]) => candidates.filter((f) => !subset.includes(f));
  const fallback: Pending = { report, subset: fb.subset, noun: fb.noun.toLowerCase(), otherNoun: otherPhotosNoun(restOf(fb.subset)), subsetBy: `fallback (${fb.by})` };
  if (!candidates.length) return { ...fallback, subsetBy: "nothing unflagged" };
  if (candidates.length > MAX_AI_FILES) { ctx.log("ai", `tina.subset skipped: ${fmt(candidates.length)} files is too many to list`); return fallback; }

  // Names and structure only. Grouped by sub-folder; flagged files are not listed at all.
  const structure: Record<string, string[]> = {};
  for (const f of candidates) (structure[path.dirname(f) === "." ? "(top)" : path.dirname(f)] ??= []).push(path.basename(f));
  const input = {
    request, project,
    folderName: path.basename(report.root),
    summary: { totalFiles: report.files.length, listedFiles: candidates.length, photos: report.images.length, photosWithGps: report.gps.size, flaggedAndHidden: report.flagged.size },
    files: structure,
  };
  const res = await ctx.ai({ task: "tina.subset", instructions: SUBSET_INSTRUCTIONS, input, schema: SubsetSchema,
    fallback: { includeAll: false, include: [], noun: "", otherNoun: "" }, cache: process.env.TINI_AI_CACHE !== "off" });
  if (res.source === "fallback") return fallback;
  const s = sanitizeSubset(res.value, candidates);
  if (s.dropped.length) ctx.log("ai", `tina.subset: dropped ${s.dropped.length} name(s) that aren't unflagged files in the folder: ${JSON.stringify(s.dropped.slice(0, 10))}`);
  if (!s.subset.length) return { ...fallback, subsetBy: `fallback (AI picked nothing usable; ${fb.by})` };
  // Code owns the safety wording: camera-roll leftovers are "personal photos" whatever the AI called them.
  const codeOther = otherPhotosNoun(restOf(s.subset));
  const otherNoun = codeOther === "personal photos" ? codeOther : (s.otherNoun ?? codeOther);
  return { report, subset: s.subset, noun: s.noun ?? kindNoun(s.subset), otherNoun, subsetBy: `ai (${res.source})` };
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------
export function buildCard(p: Pending, source: EscalationSource, display: string, reason?: string): EscalationCard {
  const r = p.report;
  const inSubset = new Set(p.subset);
  const rest = r.files.filter((f) => !inSubset.has(f) && !r.flagged.has(f) && !r.secretNames.has(f));
  const restImages = rest.filter((f) => kindOf(f) === "image");
  const restOther = rest.filter((f) => kindOf(f) !== "image");

  // Flagged files grouped by what they are ("driver's license scan", "file with a password in it").
  const groups = new Map<string, { one: string; many: string; n: number }>();
  for (const f of new Set([...r.flagged, ...r.secretNames])) {
    const noun = flagNoun(r, f);
    const g = groups.get(noun.one) ?? { ...noun, n: 0 };
    g.n++; groups.set(noun.one, g);
  }
  const flagLabel = (g: { one: string; many: string; n: number }) => (g.n === 1 ? g.one : g.many);

  const highlights: InspectionHighlight[] = [];
  if (p.subset.length) highlights.push({ label: p.noun, count: p.subset.length, severity: "low" });
  if (restImages.length) highlights.push({ label: p.otherNoun, count: restImages.length, severity: p.otherNoun === "personal photos" ? "medium" : "low" });
  if (restOther.length) highlights.push({ label: "other files", count: restOther.length, severity: "low" });
  for (const g of groups.values()) highlights.push({ label: flagLabel(g), count: g.n, severity: "high" });
  if (r.gps.size) highlights.push({ label: "photos with GPS location", count: r.gps.size, severity: "medium" });

  const staysOut: string[] = [];
  if (restImages.length) staysOut.push(`the ${fmt(restImages.length)} ${p.otherNoun}`);
  if (restOther.length) staysOut.push(`the ${fmt(restOther.length)} other ${restOther.length === 1 ? "file" : "files"}`);
  for (const g of groups.values()) staysOut.push(g.n === 1 ? `the ${g.one}` : `the ${fmt(g.n)} ${g.many}`);
  const verb = staysOut.length === 1 && (restImages.length + restOther.length + [...groups.values()].reduce((n, g) => n + g.n, 0)) === 1 ? "stays" : "stay";
  const subsetHasPhotos = p.subset.some((f) => kindOf(f) === "image");
  const narrowDetail = [subsetHasPhotos ? "Locations removed." : "", staysOut.length ? `${cap(joinAnd(staysOut))} ${verb} out.` : "Nothing else is in the folder."].filter(Boolean).join(" ");

  const allCount = r.files.length - r.secretNames.size;
  const personalGroups = [...groups.values()].filter((g) => g.one !== "secret key file");
  const including = personalGroups.map((g) => (g.n === 1 ? `the ${g.one}` : `${fmt(g.n)} ${g.many}`));
  const allDetail = `All ${fmt(allCount)} files${including.length ? `, including ${joinAnd(including)}` : ""}.${r.secretNames.size ? " Secret key files stay out." : ""}`;

  const options: EscalationOption[] = [];
  if (p.subset.length) options.push({ id: "narrow", label: `Allow only the ${fmt(p.subset.length)} ${p.noun}`, detail: narrowDetail, recommended: true });
  options.push({ id: "all", label: "Allow the whole folder", detail: allDetail, recommended: false });
  options.push({ id: "deny", label: "Deny", detail: "Claude keeps working without it.", recommended: !p.subset.length });

  const cleanReason = reason ? clip(reason, 140) : "";
  const ask = source === "prompt"
    ? "Your new request needs a folder that isn't inside the fence yet."
    : cleanReason ? `Claude wants ${display}: ${cleanReason}` : `Claude wants ${display}. Claude asked for a folder you didn't name.`;
  return { ask, inspection: { totalFiles: r.files.length, highlights }, options };
}

function refusedCard(display: string, why: string): EscalationCard {
  return {
    ask: `${display} ${why}, so Tini won't open it.`,
    inspection: { totalFiles: 0, highlights: [] },
    options: [{ id: "deny", label: "Deny", detail: "Claude keeps working without it.", recommended: true }],
  };
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------
export function createEscalation(deps: EscalationDeps) {
  const pending = new Map<string, Pending>();

  const contextFor = (ctx: CrewCtx, requested: string, source: EscalationSource) => {
    const s = ctx.state();
    const project = s.turns[0]?.prompt ?? "";
    const request = source === "prompt"
      ? (s.prompt ?? s.turns[s.turns.length - 1]?.prompt ?? "")
      : (deps.agentReason?.(requested) ?? "Claude asked for this folder while working on the project.");
    return { request, project };
  };

  async function inspectRequest(ctx: CrewCtx, requested: string, source: EscalationSource): Promise<EscalationCard> {
    const j = judgePath(requested);
    if (!j.ok) {
      pending.delete(requested);
      ctx.log("scan", `escalation for ${requested} refused by code: ${j.reason}`);
      return refusedCard(j.display, j.why === "sensitive" ? `is private (${j.reason})` : "doesn't exist");
    }
    const report = await inspectFolder(j.abs);
    ctx.log("scan", `Tina inspected ${report.display}: ${fmt(report.files.length)} files, ${fmt(report.images.length)} photos, ${fmt(report.gps.size)} with GPS, ` +
      `${report.personal.length} personal document(s) by content, ${report.riskyNames.length} risky name(s); ${report.contentChecked} files content-checked in ${report.ms}ms`);
    const { request, project } = contextFor(ctx, requested, source);
    const p = await pickSubset(ctx, report, request, project);
    ctx.log("scan", `subset for ${report.display}: ${p.subset.length} ${p.noun} by ${p.subsetBy}`);
    pending.set(requested, p);
    const flagged = [...report.flagged];
    if (flagged.length) {
      const first = flagNoun(report, flagged[0]).one;
      ctx.say("tina", flagged.length === 1 ? `There's a ${first} in there. It stays out unless you say so.` : `${flagged.length} private files in there, like a ${first}. They stay out unless you say so.`);
    }
    return buildCard(p, source, report.display, source === "agent" ? deps.agentReason?.(requested) : undefined);
  }

  async function applyEscalation(ctx: CrewCtx, esc: OpenEscalation, choice: Choice): Promise<EscalationApplied> {
    const j = judgePath(esc.requested);
    const display = j.display;
    if (choice === "deny" || !j.ok) {
      pending.delete(esc.requested);
      return { note: `The owner did not allow ${display}. Keep working without it.` };
    }
    const staged = deps.getStaged();
    if (!staged) throw new Error("no workspace yet: escalation approved before staging");

    let p = pending.get(esc.requested);
    if (!p) {                                   // e.g. the card was replayed: recompute with code only
      const report = await inspectFolder(j.abs);
      const candidates = report.files.filter((f) => !report.flagged.has(f) && !report.secretNames.has(f));
      const { request, project } = contextFor(ctx, esc.requested, esc.source);
      const fb = fallbackSubset(candidates, `${request}\n${project}`);
      p = { report, subset: fb.subset, noun: fb.noun.toLowerCase(), otherNoun: "other photos", subsetBy: "fallback (recomputed)" };
    }
    pending.delete(esc.requested);
    const r = p.report;
    const narrow = choice === "narrow";
    const files = narrow ? p.subset : r.files.filter((f) => !r.secretNames.has(f));

    const taken = new Set(ctx.state().segments.map((s) => s.id));
    const label = segmentLabel(r.root, files);
    let id = slug(label) || "extra-files";
    for (let n = 2, base = id; taken.has(id) || id === "workspace" || id === "web-packages" || fs.existsSync(path.join(staged.workspace, "assets", id)); n++) id = `${base}-${n}`;
    const destDir = path.join(staged.workspace, "assets", id);
    fs.mkdirSync(destDir, { recursive: true });

    const copied: string[] = [];
    for (const rel of files) {
      const from = r.isDir ? path.join(r.root, rel) : r.root;
      const to = path.join(destDir, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
      copied.push(to);
    }
    // Same rule as the stager: strip GPS from every image copy; anything we can't prove clean is removed.
    const leftovers = await stripGpsBatch(copied.filter((f) => kindOf(f) === "image"));
    for (const f of leftovers) fs.rmSync(f, { force: true });
    if (leftovers.length) ctx.log("scan", `${leftovers.length} image(s) from ${display} couldn't be cleaned and were left out`);
    const fileCount = copied.length - leftovers.length;
    recordBaseline(staged, copied);

    const images = files.filter((f) => kindOf(f) === "image").length - leftovers.length;
    const detailParts = [images ? `${fmt(images)} ${images === 1 ? "photo" : "photos"}` : "", fileCount - images ? `${fmt(fileCount - images)} ${fileCount - images === 1 ? "file" : "files"}` : ""].filter(Boolean);
    const detail = `${detailParts.join(", ") || "empty"}${images ? ", locations removed" : ""}`;
    ctx.emit({ actor: "tini", type: "fence.segment.built", segment: { id, label, kind: "folder", detail, status: "built" } });
    ctx.emit({ actor: "tini", type: "tini.carry.box", segmentId: id, fileCount });

    const assetsPath = `./assets/${id}`;
    staged.pathMap[pretty(r.root)] = assetsPath;    // later prompts naming this folder are inside the fence and get rewritten
    ctx.log("scan", `copied ${fmt(fileCount)} file(s) from ${display} to ${assetsPath}/ (${choice}; GPS removed)`);
    return {
      note: `The owner approved ${fmt(fileCount)} ${narrow ? p.noun : "files"} for you. Copies are in ${assetsPath}/ (photo locations removed). Use them from there.`,
      segmentId: id, assetsPath, fileCount,
    };
  }

  return { inspectRequest, applyEscalation, reset: () => pending.clear() };
}
