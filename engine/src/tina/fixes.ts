// One-click fixes. Each is a fixed code template (never AI), followed by a rescan.
// The segment turns green only if the rescan is clean; otherwise it stays red with the reason.
import fs from "node:fs";
import path from "node:path";
import type { Finding } from "../../../shared/events.ts";
import type { Staged } from "../tini/stager.ts";
import { identifyingTags, stripAllMetadata } from "./exif.ts";
import { FIXES, toFinding, type TinaCtx } from "./findings.ts";
import { kindOf } from "./preinspect.ts";
import { CODE_EXT, extractRefs, resolveRef, scanWorkspace, walkWorkspace, type RawFinding } from "./scan.ts";

export interface FixResult { summary: string; green: boolean; remaining: Finding[] }
export interface FixOptions { mode?: "full" | "crew" }

const TEXTISH = new Set([...CODE_EXT, ".md", ".txt", ".csv", ".tsv", ".xml", ".yml", ".yaml", ".ini", ".svg", ".env"]);
const posix = (p: string) => p.split(path.sep).join("/");
const read = (f: string) => fs.readFileSync(f, "utf8");

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
const MAPS_LOADER = /(?:https?:)?\/\/maps\.googleapis\.com\/maps\/api\/js/g;
const MAPS_SCRIPT_TAG = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*maps\.googleapis\.com\/maps\/api\/js[^"']*["'][^>]*>\s*<\/script>\s*/gi;
const STATIC_MAP_IMG = /<img\b[^>]*\bsrc\s*=\s*["'][^"']*maps\.googleapis\.com\/maps\/api\/staticmap[^"']*["'][^>]*>/gi;
const EMBED_V1_SRC = /(["'])(?:https?:)?\/\/www\.google\.com\/maps\/embed\/v1\/[^"']*\1/gi;
const MAP_TARGET = /new\s+google\.maps\.Map\(\s*document\.(?:getElementById\(\s*['"]([\w-]+)['"]\s*\)|querySelector\(\s*['"]#([\w-]+)['"]\s*\))/g;

/** The company address, from the approved documents first, then the pages. */
export function findAddress(ws: string, files: string[]): string {
  const docs = [...files.filter((f) => f.startsWith("assets/") && /\.(md|txt)$/i.test(f)), ...files.filter((f) => /\.html?$/i.test(f))];
  for (const f of docs) {
    const t = read(path.join(ws, f));
    const labeled = t.match(/Address:?\**\s*:?\s*([^\n<|]{8,120})/i)?.[1];
    if (labeled) return labeled.replace(/\*+/g, "").trim().replace(/[.;]$/, "");
    const plain = t.match(/\b\d{2,6}\s+[A-Za-z0-9 .#-]{3,60},\s*(?:(?:Suite|Ste\.?|Unit)\s*\w+,\s*)?[A-Za-z .]{2,40},\s*[A-Z]{2}\s+\d{5}\b/)?.[0];
    if (plain) return plain.trim();
  }
  const title = files.filter((f) => /\.html?$/i.test(f)).map((f) => read(path.join(ws, f)).match(/<title>([^<]{3,80})<\/title>/i)?.[1]).find(Boolean);
  return title?.trim() ?? "Miami, FL";
}

export function keylessEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

interface Done { summary: string; log: string }

function moveKeyOut(staged: Staged, raw: RawFinding): Done {
  const ws = staged.workspace;
  const files = walkWorkspace(ws);
  const secrets = raw.secrets ?? [];
  if (!secrets.length) throw new Error("no key to move (the scan kept no value)");

  // 1. Remove the key everywhere in the workspace (code gets an empty string, notes get a marker).
  const touched: string[] = [];
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!TEXTISH.has(ext) && !path.basename(f).startsWith(".env")) continue;
    const abs = path.join(ws, f);
    let t: string; try { t = read(abs); } catch { continue; }
    if (!secrets.some((s) => t.includes(s))) continue;
    for (const s of secrets) t = t.split(s).join(CODE_EXT.has(ext) ? "" : "[key removed by Tina]");
    fs.writeFileSync(abs, t);
    touched.push(f);
  }

  // 2. A key-based Google map becomes a keyless embed of the company address.
  const web = files.filter((f) => /\.(html?|js|mjs|cjs|jsx|ts|tsx)$/i.test(f));
  const usesMaps = web.some((f) => { const t = read(path.join(ws, f)); return /maps\.googleapis\.com\/maps\/api\/(js|staticmap)|google\.maps\.Map|google\.com\/maps\/embed\/v1/.test(t); });
  if (!usesMaps) return { summary: "Key removed from the site", log: `removed the key from ${touched.length} file(s): ${touched.join(", ")}` };

  const address = findAddress(ws, files);
  const url = keylessEmbedUrl(address);
  const iframe = (cls = "") => `<iframe class="tini-map${cls ? " " + cls : ""}" src="${url}" width="100%" height="400" style="border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map: ${address.replace(/"/g, "&quot;")}"></iframe>`;
  const targets = new Set<string>();
  for (const f of web) for (const m of read(path.join(ws, f)).matchAll(MAP_TARGET)) targets.add(m[1] ?? m[2]);
  if (!targets.size) targets.add("map");

  let maps = 0;
  for (const f of web) {
    const abs = path.join(ws, f);
    const before = read(abs);
    let t = before;
    if (/\.html?$/i.test(f)) {
      t = t.replace(MAPS_SCRIPT_TAG, "");
      t = t.replace(STATIC_MAP_IMG, () => { maps++; return iframe(); });
      t = t.replace(EMBED_V1_SRC, (_m, q) => { maps++; return `${q}${url}${q}`; });
      if (!t.includes(url)) {
        for (const id of targets) {
          const open = new RegExp(`<([a-zA-Z][\\w-]*)([^>]*\\bid\\s*=\\s*["']${id}["'][^>]*)>`);
          t = t.replace(open, (_m, tag: string, attrs: string) => {
            maps++;
            const cls = attrs.match(/\bclass\s*=\s*["']([^"']*)["']/)?.[1] ?? "";
            return `${iframe(cls)}<${tag}${attrs}${/\bhidden\b/.test(attrs) ? "" : " hidden"}>`;
          });
        }
      }
    }
    t = t.replace(MAPS_LOADER, "about:blank#tini-removed-maps-loader");   // a keyless loader would only show an error box
    if (t !== before) { fs.writeFileSync(abs, t); if (!touched.includes(f)) touched.push(f); }
  }
  return {
    summary: maps ? "Key removed; map switched to a keyless embed" : "Key removed; Google map switched off",
    log: `removed the key from ${touched.length} file(s) and replaced the Google map with a keyless map of ${address}${maps ? "" : " (no map spot found on the pages)"}`,
  };
}

async function removePhoto(staged: Staged, file: string): Promise<string> {
  const ws = staged.workspace;
  const gone = path.join(ws, file);
  const files = walkWorkspace(ws);
  // Another approved photo with no identifying details, same folder first.
  const pool = files.filter((f) => f.startsWith("assets/") && kindOf(f) === "image" && f !== file);
  const tags = await identifyingTags(pool.map((f) => path.join(ws, f)));
  const clean = pool.filter((f) => Object.keys(tags.get(path.resolve(path.join(ws, f))) ?? { unknown: 1 }).length === 0);
  const dir = path.posix.dirname(file);
  const replacement = clean.find((f) => path.posix.dirname(f) === dir) ?? clean[0];

  // Repoint references in pages, styles and scripts (outside assets) before deleting.
  let repointed = 0;
  for (const f of files.filter((x) => !x.startsWith("assets/") && /\.(html?|css|js|mjs|jsx|tsx?)$/i.test(x))) {
    const abs = path.join(ws, f);
    let t = read(abs);
    const ext = path.extname(f).toLowerCase();
    const raws = [...new Set(extractRefs(t, ext).map((r) => r.raw).filter((r) => resolveRef(r, abs, ws).includes(gone)))];
    if (!raws.length) continue;
    for (const r of raws) {
      let next = "";
      if (replacement) {
        if (path.posix.dirname(replacement) === dir && r.endsWith(path.posix.basename(file))) next = r.slice(0, -path.posix.basename(file).length) + path.posix.basename(replacement);
        else next = r.startsWith("/") ? "/" + replacement : posix(path.relative(path.dirname(abs), path.join(ws, replacement)));
      }
      t = t.split(r).join(next);
      repointed++;
    }
    fs.writeFileSync(abs, t);
  }
  fs.rmSync(gone, { force: true });
  return replacement
    ? `removed ${file} and pointed ${repointed} reference(s) at ${replacement}`
    : `removed ${file} (no other clean approved photo to use; ${repointed} reference(s) cleared)`;
}

/** Performs a fix on every file in the finding's group. Summaries are short and past tense. */
async function perform(staged: Staged, raw: RawFinding, fixId: string): Promise<Done> {
  const k = raw.files.length;
  const abs = (f: string) => path.join(staged.workspace, f);
  switch (fixId) {
    case "move-key-out": return moveKeyOut(staged, raw);
    case "strip-metadata": {
      for (const f of raw.files) await stripAllMetadata(abs(f));
      const what = /name|serial/.test(raw.detail) ? "Camera owner details removed" : "Photo locations removed";
      return { summary: k === 1 ? what : `${what} from ${k} photos`, log: `removed hidden details (${raw.detail}) from ${raw.files.join(", ")}` };
    }
    case "remove-photo": {
      const logs: string[] = [];
      for (const f of raw.files) logs.push(await removePhoto(staged, f));
      return { summary: k === 1 ? "Photo removed" : `${k} photos removed`, log: logs.join("; ") };
    }
    case "remove-file":
      for (const f of raw.files) fs.rmSync(abs(f), { force: true });
      return { summary: k === 1 ? "File removed" : `${k} files removed`, log: `removed ${raw.files.join(", ")}` };
  }
  throw new Error(`unknown fix ${fixId}`);
}

// ---------------------------------------------------------------------------
// applyFix
// ---------------------------------------------------------------------------
/**
 * Performs the fix, rescans, and reports. "full" mode emits fix.applied, then
 * segment.green if that segment is now clean, else segment.red with what's left.
 * "crew" mode is for today's project.ts (which emits fix.applied + green itself):
 * it throws if the same problem is still there, and emits segment.red for any NEW
 * problem in the segment so project.ts won't turn it green.
 */
export async function applyFix(ctx: TinaCtx, staged: Staged, findingId: string, fixId: string, opts: FixOptions = {}): Promise<FixResult> {
  const full = (opts.mode ?? "full") === "full";
  const segIds = ctx.state().segments.map((s) => s.id);
  const known = ctx.state().findings;
  const before = await scanWorkspace(staged, { segmentIds: segIds });
  const raw = before.findings.find((f) => f.id === findingId);
  const segmentId = raw?.segmentId ?? known.find((f) => f.id === findingId)?.segmentId ?? "workspace";

  let summary: string;
  if (!raw) { summary = "Already gone"; ctx.log("scan", `fix ${fixId} on ${findingId}: Tina doesn't find this problem any more`); }
  else {
    if (!FIXES[raw.type].some((x) => x.id === fixId)) throw new Error(`${fixId} doesn't fix a ${raw.type} finding`);
    const done = await perform(staged, raw, fixId);
    summary = done.summary;
    ctx.log("scan", `fix ${fixId} on ${raw.files.length} file(s): ${done.log}`);
  }

  // Rescan (whole workspace is quick; only this segment's verdict is decided here).
  const after = await scanWorkspace(staged, { segmentIds: segIds });
  const remainingRaw = after.findings.filter((f) => f.segmentId === segmentId);
  const remaining = await Promise.all(remainingRaw.map((r) => toFinding(ctx.ai, r)));
  const stillThere = remainingRaw.some((f) => f.id === findingId);
  const nowIds = new Set(after.findings.map((f) => f.id));

  if (!full && stillThere) throw new Error(`${summary}, but Tina still finds the problem in ${raw?.file ?? "the workspace"}`);
  // Other findings in this segment that the fix also made go away (e.g. a removed file had two problems).
  for (const k of known) if (k.segmentId === segmentId && k.id !== findingId && !nowIds.has(k.id)) {
    ctx.emit({ actor: "tina", type: "finding.cleared", findingId: k.id, reason: `Went away with the fix: ${summary}` });
  }
  if (full) {
    ctx.emit({ actor: "tina", type: "fix.applied", findingId, fixId, summary: stillThere ? `${summary}, but the problem is still there` : summary });
    if (!remaining.length) ctx.emit({ actor: "tina", type: "segment.green", segmentId });
    else for (const f of remaining) ctx.emit({ actor: "tina", type: "segment.red", segmentId, finding: f });
  } else {
    for (const f of remaining) if (!known.some((k) => k.id === f.id)) ctx.emit({ actor: "tina", type: "segment.red", segmentId, finding: f });
  }
  if (remaining.length) ctx.log("scan", `after the fix, ${segmentId} is still red: ${remaining.map((f) => `${f.title} (${f.file})`).join("; ")}`);
  return { summary, green: remaining.length === 0, remaining };
}
