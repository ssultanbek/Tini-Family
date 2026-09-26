// Tina's folder pre-inspection (turn 1). Code only: file names, counts and photo
// metadata. It never reads file contents and never calls AI.
import fs from "node:fs";
import path from "node:path";
import { exiftool } from "exiftool-vendored";
import type { Ev } from "../crew.ts";

export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff", ".webp", ".dng"]);
const DOC_EXT = new Set([".md", ".txt", ".pdf", ".doc", ".docx", ".rtf", ".odt", ".pages"]);
const DATA_EXT = new Set([".csv", ".tsv", ".xlsx", ".xls", ".json", ".numbers"]);
const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".css", ".py", ".rb", ".go", ".java", ".sh"]);
/** Never inspected, counted or copied. */
export const SKIP_NAMES = new Set([".DS_Store", ".tini-demo-kit", "Thumbs.db"]);
export const WALK_LIMIT = 20000;

export type FileKind = "image" | "document" | "data" | "code" | "other";
export function kindOf(file: string): FileKind {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (DOC_EXT.has(ext)) return "document";
  if (DATA_EXT.has(ext)) return "data";
  if (CODE_EXT.has(ext)) return "code";
  return "other";
}

// Risky names. Matched per word so "syntax.md" isn't "tax" and a code LICENSE file isn't a license.
const RISKY_WORDS: [RegExp, string][] = [
  [/^passports?$/, "looks like a passport"],
  [/^(tax|taxes|w2)$/, "looks like tax papers"],
  [/^(bank|banking|statement)$/, "looks like bank records"],
  [/^(license|licence|dl)$/, "looks like a license or ID"],
  [/^ssn$/, "looks like a Social Security number"],
  [/^(password|passwords|passwd|credentials?)$/, "looks like it holds a password"],
];
export function riskyReason(name: string): string | null {
  if (/^\.env(\..*)?$/i.test(name)) return "holds secret keys (.env)";
  if (/^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(name)) return "is an SSH key";
  if (/\.(pem|key|p12|pfx)$/i.test(name)) return "is a key or certificate file";
  if (/^licen[cs]e(\.(md|txt))?$/i.test(name)) return null; // software license file
  const words = name.toLowerCase().replace(/\.[a-z0-9]+$/, "").split(/[^a-z0-9]+/).filter(Boolean);
  for (const w of words) for (const [re, why] of RISKY_WORDS) if (re.test(w)) return why;
  return null;
}

export interface RiskyFile { rel: string; reason: string }
export interface FolderInspection {
  segmentId: string;
  root: string;               // absolute source (folder or single file)
  isDir: boolean;
  files: string[];            // relative paths that will be copied (risky + skipped already removed)
  counts: Record<FileKind, number>;
  gpsImages: string[];        // relative paths of copied images that carry GPS
  risky: RiskyFile[];         // left out of the copy
  symlinks: string[];         // left out of the copy
  truncated: boolean;
}

export function walk(root: string, isDir: boolean) {
  const files: string[] = [], symlinks: string[] = [];
  if (!isDir) return { files: [path.basename(root)], symlinks, truncated: false };
  const stack = [""];
  let truncated = false;
  while (stack.length) {
    const rel = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (SKIP_NAMES.has(e.name)) continue;
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isSymbolicLink()) symlinks.push(r);
      else if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git") stack.push(r); }
      else if (e.isFile()) files.push(r);
      if (files.length >= WALK_LIMIT) { truncated = true; break; }
    }
    if (truncated) break;
  }
  return { files: files.sort(), symlinks: symlinks.sort(), truncated };
}

async function hasGps(file: string): Promise<boolean> {
  try {
    const t = await exiftool.read(file);
    return t.GPSLatitude !== undefined || t.GPSLongitude !== undefined || t.GPSPosition !== undefined;
  } catch { return false; }
}

export async function inspectSource(segmentId: string, root: string, isDir: boolean): Promise<FolderInspection> {
  const w = walk(root, isDir);
  const risky: RiskyFile[] = [];
  const files: string[] = [];
  for (const f of w.files) {
    const why = riskyReason(path.basename(f));
    if (why) risky.push({ rel: f, reason: why }); else files.push(f);
  }
  const counts: Record<FileKind, number> = { image: 0, document: 0, data: 0, code: 0, other: 0 };
  for (const f of files) counts[kindOf(f)]++;
  const images = files.filter((f) => kindOf(f) === "image");
  const abs = (f: string) => (isDir ? path.join(root, f) : root);
  const flags = await Promise.all(images.map((f) => hasGps(abs(f))));
  return { segmentId, root, isDir, files, counts, gpsImages: images.filter((_, i) => flags[i]), risky, symlinks: w.symlinks, truncated: w.truncated };
}

const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** One line under the segment label, e.g. "31 photos, locations removed". */
export function detailLine(i: FolderInspection): string {
  const parts: string[] = [];
  const c = i.counts;
  if (c.image) parts.push(plural(c.image, "photo") + (i.gpsImages.length ? ", locations removed" : ""));
  if (c.document) parts.push(plural(c.document, "document"));
  if (c.data) parts.push(plural(c.data, "data file"));
  if (c.code) parts.push(plural(c.code, "code file"));
  if (c.other) parts.push(plural(c.other, "other file"));
  if (i.risky.length) parts.push(`${i.risky.length} left out`);
  return parts.join(", ") || "empty";
}

/** Contract "stripped" lines for everything Tina found. */
export function strippedLines(all: FolderInspection[], display: (abs: string) => string): string[] {
  const lines: string[] = [];
  const gps = all.reduce((n, i) => n + i.gpsImages.length, 0);
  if (gps) lines.push(`${plural(gps, "photo")} ${gps === 1 ? "contains a GPS location" : "contain GPS locations"}, removed before Claude sees them`);
  for (const i of all) for (const r of i.risky) {
    lines.push(`Left out ${display(i.isDir ? path.join(i.root, r.rel) : i.root)}: it ${r.reason}`);
  }
  for (const i of all) for (const s of i.symlinks) lines.push(`Left out the shortcut ${display(path.join(i.root, s))}`);
  for (const i of all) if (i.truncated) lines.push(`${display(i.root)} is very large; only the first ${WALK_LIMIT.toLocaleString("en-US")} files were looked at`);
  return lines;
}

export interface PreinspectSource { segmentId: string; abs: string; isDir: boolean; label: string }

/** Tina looks at every named folder before the contract card. Emits tina.inspect.* and her speech. */
export async function preinspect(sources: PreinspectSource[], emit?: (ev: Ev) => void): Promise<FolderInspection[]> {
  const out: FolderInspection[] = [];
  for (const s of sources) {
    emit?.({ actor: "tina", type: "tina.inspect.started", scope: "folder", segmentId: s.segmentId });
    const i = await inspectSource(s.segmentId, s.abs, s.isDir);
    out.push(i);
    if (i.gpsImages.length) {
      emit?.({ actor: "tina", type: "speech", text: `${plural(i.gpsImages.length, "photo")} in ${s.label} ${i.gpsImages.length === 1 ? "has" : "have"} GPS locations in ${i.gpsImages.length === 1 ? "it" : "them"}. I'll strip that.` });
    }
    if (i.risky.length) {
      emit?.({ actor: "tina", type: "speech", text: `${s.label} has ${plural(i.risky.length, "risky file")}. ${i.risky.length === 1 ? "It stays" : "They stay"} outside.` });
    }
  }
  emit?.({ actor: "tina", type: "tina.inspect.finished", scope: "folder", redCount: 0 });
  return out;
}
