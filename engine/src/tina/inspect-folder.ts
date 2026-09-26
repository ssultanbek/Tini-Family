// Tina inspects a folder someone asked for (Claude or Maria). Code only, all local:
// names, counts, photo metadata (one batched exiftool run) and a content check for
// personal documents (PDF text layer + plain text). Nothing here is ever sent anywhere.
import fs from "node:fs";
import path from "node:path";
import { pretty } from "../guard.ts";
import { gpsFiles } from "./exif.ts";
import { kindOf, riskyReason, walk, type FileKind } from "./preinspect.ts";

export type PersonalKind = "license" | "ssn" | "passport" | "card" | "password";
export interface PersonalHit { rel: string; kind: PersonalKind }

export interface FolderReport {
  root: string;
  display: string;
  isDir: boolean;
  files: string[];                 // every file (relative), symlinks and .DS_Store excluded
  symlinks: string[];
  truncated: boolean;
  counts: Record<FileKind, number>;
  images: string[];
  gps: Set<string>;                // relative paths of images with a GPS position
  riskyNames: { rel: string; reason: string }[];
  secretNames: Set<string>;        // key/.env files: never copied, even with "all"
  personal: PersonalHit[];         // found by content
  flagged: Set<string>;            // riskyNames + personal: never in a narrow subset
  contentChecked: number;
  ms: number;
}

// ---------------------------------------------------------------------------
// Content patterns
// ---------------------------------------------------------------------------
const TEXT_EXT = new Set([".txt", ".md", ".csv", ".tsv", ".json", ".log", ".rtf", ".html", ".htm", ".xml", ".yml", ".yaml", ".ini", ".conf", ".cfg"]);
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_TEXT_FILES = 5000;
const MAX_PDFS = 300;
const MAX_PDF_PAGES = 3;

function luhn(digits: string): boolean {
  let sum = 0, dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Which kinds of personal data a text contains. */
export function personalKinds(text: string): PersonalKind[] {
  const kinds = new Set<PersonalKind>();
  if (/DRIVER'?S?\s+LICEN[CS]E|\bDL\s*(NO|#|NUMBER)\b/i.test(text)) kinds.add("license");
  if (/\b(SSN|social security)\b/i.test(text) && /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/.test(text)) kinds.add("ssn");
  else if (/\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/.test(text)) kinds.add("ssn");
  if (/\bpassport\s*(no\.?|number|#)?\s*[:#]?\s*[A-Z0-9]{6,9}\b/i.test(text)) kinds.add("passport");
  for (const m of text.matchAll(/\b\d(?:[ -]?\d){12,18}\b/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && /^[3-6]/.test(digits) && luhn(digits)) { kinds.add("card"); break; }
  }
  if (/^\s*(password|passwd|pwd|passcode|pin)\s*[:=]\s*\S+/im.test(text)) kinds.add("password");
  return [...kinds];
}

type PdfJs = { getDocument(args: object): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string }[] }> }> }>; destroy(): Promise<void> } };
let pdfjs: PdfJs | null = null;
async function pdfText(file: string): Promise<string> {
  pdfjs ??= (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJs;
  const task = pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0, isEvalSupported: false, useSystemFonts: true });
  try {
    const doc = await task.promise;
    let text = "";
    for (let i = 1; i <= Math.min(doc.numPages, MAX_PDF_PAGES); i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      text += c.items.map((it) => it.str ?? "").join(" ") + "\n";
    }
    return text;
  } finally { await task.destroy().catch(() => {}); }
}

const SECRET_NAME = /^\.env(\..*)?$|^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$|\.(pem|key|p12|pfx)$/i;

// ---------------------------------------------------------------------------
// The inspection
// ---------------------------------------------------------------------------
export async function inspectFolder(absRoot: string): Promise<FolderReport> {
  const t0 = Date.now();
  const isDir = fs.statSync(absRoot).isDirectory();
  const w = walk(absRoot, isDir);
  const abs = (rel: string) => (isDir ? path.join(absRoot, rel) : absRoot);

  const counts: Record<FileKind, number> = { image: 0, document: 0, data: 0, code: 0, other: 0 };
  for (const f of w.files) counts[kindOf(f)]++;
  const images = w.files.filter((f) => kindOf(f) === "image");

  const riskyNames: FolderReport["riskyNames"] = [];
  const secretNames = new Set<string>();
  for (const f of w.files) {
    const why = riskyReason(path.basename(f));
    if (why) riskyNames.push({ rel: f, reason: why });
    if (SECRET_NAME.test(path.basename(f))) secretNames.add(f);
  }

  // GPS: one exiftool process for every image, in parallel with the content check.
  const gpsP = gpsFiles(images.map(abs));

  const personal: PersonalHit[] = [];
  let contentChecked = 0;
  const pdfs = w.files.filter((f) => path.extname(f).toLowerCase() === ".pdf").slice(0, MAX_PDFS);
  const texts = w.files.filter((f) => TEXT_EXT.has(path.extname(f).toLowerCase())).slice(0, MAX_TEXT_FILES);
  for (const f of pdfs) {
    try { for (const kind of personalKinds(await pdfText(abs(f)))) personal.push({ rel: f, kind }); contentChecked++; }
    catch { /* unreadable PDF: counted as a document, not flagged */ }
  }
  for (const f of texts) {
    try {
      const fd = fs.openSync(abs(f), "r");
      const buf = Buffer.alloc(Math.min(fs.fstatSync(fd).size, MAX_TEXT_BYTES));
      fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
      for (const kind of personalKinds(buf.toString("utf8"))) personal.push({ rel: f, kind });
      contentChecked++;
    } catch { /* unreadable: skip */ }
  }

  const gpsAbs = await gpsP;
  const gps = new Set(images.filter((f) => gpsAbs.has(path.resolve(abs(f)))));
  const flagged = new Set([...riskyNames.map((r) => r.rel), ...personal.map((p) => p.rel)]);
  return {
    root: absRoot, display: pretty(absRoot), isDir, files: w.files, symlinks: w.symlinks, truncated: w.truncated,
    counts, images, gps, riskyNames, secretNames, personal, flagged, contentChecked, ms: Date.now() - t0,
  };
}

/** Plain-English name for a flagged file, e.g. "driver's license scan". */
export function flagNoun(r: FolderReport, rel: string): { one: string; many: string } {
  const hit = r.personal.find((p) => p.rel === rel);
  const isPdfOrImage = /\.(pdf|jpe?g|png|heic|tiff?)$/i.test(rel);
  switch (hit?.kind) {
    case "license": return isPdfOrImage ? { one: "driver's license scan", many: "driver's license scans" } : { one: "file with a driver's license number", many: "files with driver's license numbers" };
    case "passport": return isPdfOrImage ? { one: "passport scan", many: "passport scans" } : { one: "file with a passport number", many: "files with passport numbers" };
    case "ssn": return { one: "file with a Social Security number", many: "files with Social Security numbers" };
    case "card": return { one: "file with a card number", many: "files with card numbers" };
    case "password": return { one: "file with a password in it", many: "files with passwords in them" };
  }
  if (r.secretNames.has(rel)) return { one: "secret key file", many: "secret key files" };
  return { one: "risky-looking file", many: "risky-looking files" };
}
