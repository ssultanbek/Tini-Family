// Tina's per-turn scan of the workspace. Code only, all local: secret values, personal
// data and photo metadata never leave the machine (only redacted snippets go to the
// explainer). Scope = what Claude produced or what the site uses: everything outside
// assets/, plus assets the site references, plus assets Claude changed since staging.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Severity } from "../../../shared/events.ts";
import type { Staged } from "../tini/stager.ts";
import { sha1File } from "../tini/stager.ts";
import { identifyingTags } from "./exif.ts";
import { personalKinds, type PersonalKind } from "./inspect-folder.ts";
import { kindOf, riskyReason } from "./preinspect.ts";

export type FindingType = "api-key" | "photo-metadata" | "personal-data" | "risky-file";

export interface RawFinding {
  id: string;                  // stable: hash of type + segment, so a rescan recognizes it
  type: FindingType;
  segmentId: string;
  file: string;                // workspace-relative, posix: the first file in the group
  files: string[];             // every file with this problem on this segment (a fix acts on all of them)
  severity: Severity;
  detail: string;              // plain and redacted: "Google API key", "camera owner's name, camera serial number"
  snippet: string;             // redacted context for the explainer; never contains a secret or a personal value
  /** In memory only, never emitted or logged: the secret strings (for the fix). */
  secrets?: string[];
}
export interface ScanResult {
  findings: RawFinding[];
  dataLeavesTo: string[];      // outside servers the output loads from or sends to
  scope: string[];             // workspace-relative files that were checked
  secretEngine: "gitleaks" | "regex";
  ms: number;
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".claude", ".tini", ".next", ".cache"]);
const SKIP_NAMES = new Set([".DS_Store", "Thumbs.db"]);
export const CODE_EXT = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".json", ".vue", ".svelte"]);
const WEB_EXT = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".vue", ".svelte"]);
const TEXT_EXT = new Set([...CODE_EXT, ".md", ".txt", ".csv", ".tsv", ".xml", ".yml", ".yaml", ".env", ".ini", ".log", ".svg"]);
const MAX_TEXT = 1024 * 1024;
const IGNORED_DOMAINS = new Set(["www.w3.org", "w3.org", "schema.org", "localhost", "127.0.0.1", "0.0.0.0"]);

const posix = (p: string) => p.split(path.sep).join("/");
/** One finding per (type, segment): 42 GPS photos on one segment are one problem with one fix. */
export const findingId = (type: FindingType, segmentId: string) => `f-${type}-${crypto.createHash("sha1").update(`${type}:${segmentId}`).digest("hex").slice(0, 10)}`;

export function walkWorkspace(root: string): string[] {
  const out: string[] = [];
  const stack = [""];
  while (stack.length) {
    const rel = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (SKIP_NAMES.has(e.name)) continue;
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(r); }
      else if (e.isFile()) out.push(posix(r));
    }
  }
  return out.sort();
}

function readText(abs: string): string {
  try {
    const fd = fs.openSync(abs, "r");
    try {
      const buf = Buffer.alloc(Math.min(fs.fstatSync(fd).size, MAX_TEXT));
      fs.readSync(fd, buf, 0, buf.length, 0);
      return buf.toString("utf8");
    } finally { fs.closeSync(fd); }
  } catch { return ""; }
}

// ---------------------------------------------------------------------------
// References: what a page loads or links to
// ---------------------------------------------------------------------------
export interface Ref { raw: string; kind: "load" | "link" }

export function extractRefs(text: string, ext: string): Ref[] {
  const refs: Ref[] = [];
  const add = (raw: string | undefined, kind: Ref["kind"]) => { const r = raw?.trim(); if (r) refs.push({ raw: r, kind }); };
  if (ext === ".html" || ext === ".htm" || ext === ".vue" || ext === ".svelte") {
    for (const tag of text.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
      const name = tag[1].toLowerCase();
      for (const a of tag[2].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        const attr = a[1].toLowerCase(), val = a[2] ?? a[3] ?? a[4] ?? "";
        if (attr === "srcset") { for (const part of val.split(",")) add(part.trim().split(/\s+/)[0], "load"); continue; }
        if (attr === "style") { for (const u of val.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(u[1], "load"); continue; }
        if (attr === "content" && !(name === "meta" && /^(https?:)?\/\/|\.(jpe?g|png|webp|gif)$/i.test(val))) continue;
        if (["src", "href", "poster", "data-src", "data-bg", "data-background", "action", "content"].includes(attr)) {
          add(val, name === "a" && attr === "href" ? "link" : "load");
        }
      }
    }
  }
  if (ext === ".css" || ext === ".html" || ext === ".htm") {
    for (const u of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(u[1], "load");
    for (const u of text.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g)) add(u[1], "load");
  }
  // JS (and inline scripts): URL-ish or file-ish string literals.
  if (ext !== ".css") {
    for (const m of text.matchAll(/(["'`])((?:https?:)?\/\/[^"'`\s]+|[^"'`\s<>]*\.(?:jpe?g|png|gif|webp|svg|avif|pdf|md|txt|csv|json|html|css|js|mjs|woff2?)(?:[?#][^"'`\s]*)?)\1/g)) add(m[2], "load");
  }
  return refs;
}

/** Workspace files a reference points to (it may be relative to the page or to the site root). */
export function resolveRef(raw: string, fromAbs: string, workspace: string): string[] {
  if (/^(data|mailto|tel|javascript|about|blob):|^#|^(https?:)?\/\//i.test(raw) || raw.includes("${")) return [];
  let clean = raw.split(/[?#]/)[0];
  try { clean = decodeURI(clean); } catch { /* keep as is */ }
  if (!clean) return [];
  const cands = clean.startsWith("/") ? [path.join(workspace, clean)] : [path.resolve(path.dirname(fromAbs), clean), path.resolve(workspace, clean)];
  return [...new Set(cands)].filter((c) => c.startsWith(workspace + path.sep) && fs.existsSync(c) && fs.statSync(c).isFile());
}

export function externalHost(raw: string): string | null {
  const m = raw.match(/^(?:https?:)?\/\/([^/?#:\s"'`]+)/i);
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || IGNORED_DOMAINS.has(host)) return null;
  return host;
}

// ---------------------------------------------------------------------------
// Secrets: gitleaks, with our own regex as the fallback
// ---------------------------------------------------------------------------
interface SecretHit { file: string; rule: string; secret: string; line: number }

const GITLEAKS_CONFIG = `title = "tini"
[extend]
useDefault = true
[[allowlists]]
description = "dependencies and tool folders"
paths = ['''(^|/)node_modules/''', '''(^|/)\\.git/''', '''(^|/)\\.claude/''', '''(^|/)\\.tini/''']
`;

function runGitleaks(dir: string): Promise<SecretHit[]> {
  const cfg = path.join(os.tmpdir(), `tini-gitleaks-${process.pid}.toml`);
  fs.writeFileSync(cfg, GITLEAKS_CONFIG);
  return new Promise((resolve, reject) => {
    // Report to stdout as JSON; exit 0 even when leaks are found; no banner/log noise.
    const p = spawn("gitleaks", ["dir", dir, "-c", cfg, "--no-banner", "--log-level", "error", "-f", "json", "-r", "-", "--exit-code", "0"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.setEncoding("utf8").on("data", (d) => { out += d; });
    p.stderr.setEncoding("utf8").on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`gitleaks exit ${code}: ${err.slice(0, 200)}`));
      try {
        const rows = JSON.parse(out || "[]") as { File: string; RuleID: string; Secret: string; StartLine: number }[];
        resolve(rows.map((r) => ({ file: path.resolve(r.File), rule: r.RuleID, secret: r.Secret, line: r.StartLine })));
      } catch (e) { reject(e); }
    });
  });
}

const SECRET_RES: [string, RegExp][] = [
  ["gcp-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["stripe-access-token", /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/g],
  ["aws-access-token", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["github-pat", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["generic-api-key", /\b(?:api[_-]?key|secret|token|access[_-]?key)\b\s*[:=]\s*["']([A-Za-z0-9_\-]{20,})["']/gi],
];
export function regexSecrets(text: string): { rule: string; secret: string; line: number }[] {
  const hits: { rule: string; secret: string; line: number }[] = [];
  for (const [rule, re] of SECRET_RES) {
    for (const m of text.matchAll(re)) {
      const secret = m[1] ?? m[0];
      hits.push({ rule, secret, line: text.slice(0, m.index).split("\n").length });
    }
  }
  return hits;
}

const RULE_NAMES: [RegExp, string][] = [[/gcp|google/i, "Google API key"], [/stripe/i, "Stripe key"], [/aws/i, "AWS key"], [/github/i, "GitHub token"], [/slack/i, "Slack token"], [/private-key/i, "private key"]];
const ruleName = (rule: string) => RULE_NAMES.find(([re]) => re.test(rule))?.[1] ?? "secret key";

export function redact(secret: string): string {
  const keep = /^(AIza|sk_live_|sk_test_|rk_live_|AKIA|ASIA|ghp_|xox.-)/.exec(secret)?.[0] ?? "";
  return `${keep}${"•".repeat(8)}`;
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------
const TAG_WORDS: Record<string, string> = {
  GPSLatitude: "GPS location", GPSLongitude: "GPS location", Artist: "photographer's name", Creator: "photographer's name",
  "By-line": "photographer's name", OwnerName: "camera owner's name", SerialNumber: "camera serial number",
};
const PERSONAL_WORDS: Record<PersonalKind, string> = {
  license: "a driver's license number", ssn: "a Social Security number", passport: "a passport number", card: "a card number", password: "a password",
};

export interface ScanOptions { segmentIds?: string[]; useGitleaks?: boolean }

export async function scanWorkspace(staged: Staged, opts: ScanOptions = {}): Promise<ScanResult> {
  const t0 = Date.now();
  const ws = staged.workspace;
  const abs = (rel: string) => path.join(ws, rel);
  const all = walkWorkspace(ws);
  const isAsset = (rel: string) => rel.startsWith("assets/");
  const segIds = new Set(opts.segmentIds ?? [
    ...all.filter(isAsset).map((f) => f.split("/")[1]).filter(Boolean),
    "workspace", ...(staged.fence.allowedDomains.includes("registry.npmjs.org") ? ["web-packages"] : []),
  ]);

  // 1. Scope: output, plus assets that are referenced or were changed since staging.
  const outputs = all.filter((f) => !isAsset(f));
  const changedAssets = staged.baseline ? all.filter((f) => isAsset(f) && staged.baseline![f] !== sha1FileSafe(abs(f))) : [];
  const scope = new Set([...outputs, ...changedAssets]);
  const hosts = new Set<string>();
  const texts = new Map<string, string>();
  const text = (rel: string) => { if (!texts.has(rel)) texts.set(rel, readText(abs(rel))); return texts.get(rel)!; };
  for (let pass = 0; pass < 2; pass++) {                  // pass 2: referenced css/js can reference more
    for (const f of [...scope]) {
      const ext = path.extname(f).toLowerCase();
      if (!WEB_EXT.has(ext)) continue;
      for (const r of extractRefs(text(f), ext)) {
        const h = externalHost(r.raw);
        if (h) { if (r.kind === "load") hosts.add(h); continue; }
        for (const hit of resolveRef(r.raw, abs(f), ws)) scope.add(posix(path.relative(ws, hit)));
      }
    }
  }
  const inScope = [...scope].filter((f) => fs.existsSync(abs(f))).sort();

  // 2. Segment for each file.
  const assetImages = all.filter((f) => isAsset(f) && kindOf(f) === "image");
  let assetHashes: Map<string, string> | null = null;
  const segOfAsset = (rel: string) => { const s = rel.split("/")[1]; return s && segIds.has(s) ? s : "workspace"; };
  const segmentFor = (rel: string): string => {
    if (isAsset(rel)) return segOfAsset(rel);
    const ext = path.extname(rel).toLowerCase();
    if (kindOf(rel) === "image") {
      assetHashes ??= new Map(assetImages.map((a) => [sha1FileSafe(abs(a)), a]));
      const same = assetHashes.get(sha1FileSafe(abs(rel))) ?? assetImages.find((a) => path.basename(a) === path.basename(rel));
      return same ? segOfAsset(same) : "workspace";
    }
    if (CODE_EXT.has(ext)) return segIds.has("web-packages") ? "web-packages" : "workspace";
    return "workspace";
  };

  const perFile: Omit<RawFinding, "id" | "files">[] = [];
  const push = (f: Omit<RawFinding, "id" | "segmentId" | "files">) => perFile.push({ ...f, segmentId: segmentFor(f.file) });

  // 3. Secrets.
  let secretEngine: ScanResult["secretEngine"] = "gitleaks";
  let hits: SecretHit[] = [];
  if (opts.useGitleaks !== false && process.env.TINI_NO_GITLEAKS !== "1") {
    try { hits = await runGitleaks(ws); } catch { secretEngine = "regex"; }
  } else secretEngine = "regex";
  // The regex rules always run too: gitleaks' default GCP rule misses a key followed by "&",
  // e.g. maps/api/js?key=AIza...&callback=initMap, which is how Claude loads the Maps API.
  const seen = new Set(hits.map((h) => `${h.file}\0${h.secret}`));
  for (const f of inScope) if (TEXT_EXT.has(path.extname(f).toLowerCase()) || path.basename(f).startsWith(".env")) {
    for (const h of regexSecrets(text(f))) if (!seen.has(`${abs(f)}\0${h.secret}`)) { seen.add(`${abs(f)}\0${h.secret}`); hits.push({ file: abs(f), ...h }); }
  }
  const byFile = new Map<string, SecretHit[]>();
  for (const h of hits) {
    const rel = posix(path.relative(ws, h.file));
    if (!scope.has(rel)) continue;
    byFile.set(rel, [...(byFile.get(rel) ?? []), h]);
  }
  for (const [rel, hs] of byFile) {
    const names = [...new Set(hs.map((h) => ruleName(h.rule)))];
    const line = text(rel).split("\n")[hs[0].line - 1] ?? "";
    let red = line;
    for (const h of hs) red = red.split(h.secret).join(redact(h.secret));
    push({ type: "api-key", file: rel, severity: "high", detail: names.join(", "), snippet: red.trim().slice(0, 160), secrets: [...new Set(hs.map((h) => h.secret))] });
  }

  // 4. Identifying photo metadata on images in scope.
  const images = inScope.filter((f) => kindOf(f) === "image");
  const tags = await identifyingTags(images.map(abs));
  for (const f of images) {
    const t = tags.get(path.resolve(abs(f))) ?? {};
    const words = [...new Set(Object.keys(t).map((k) => TAG_WORDS[k]).filter(Boolean))];
    if (!words.length) continue;
    push({ type: "photo-metadata", file: f, severity: t.GPSLatitude !== undefined ? "high" : "medium", detail: words.join(", "),
      snippet: Object.keys(t).map((k) => `${k}: [${TAG_WORDS[k] ?? "value"} hidden]`).join(", ") });
  }

  // 5. Personal data in text files (not phone numbers or emails: contact info is meant to be public).
  for (const f of inScope) {
    const ext = path.extname(f).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    const kinds = personalKinds(text(f));
    if (!kinds.length) continue;
    push({ type: "personal-data", file: f, severity: "high", detail: kinds.map((k) => PERSONAL_WORDS[k]).join(", "),
      snippet: `a ${ext.slice(1) || "text"} file containing ${kinds.map((k) => PERSONAL_WORDS[k]).join(" and ")} [values hidden]` });
  }

  // 6. Risky file names in the output.
  for (const f of inScope) {
    const why = riskyReason(path.basename(f));
    if (why) push({ type: "risky-file", file: f, severity: "medium", detail: `it ${why}`, snippet: `file name: ${path.basename(f)}` });
  }

  return { findings: groupFindings(perFile), dataLeavesTo: [...hosts].sort(), scope: inScope, secretEngine, ms: Date.now() - t0 };
}

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

/** Per-file hits -> one finding per (type, segment). The first file's snippet goes to the explainer. */
function groupFindings(perFile: Omit<RawFinding, "id" | "files">[]): RawFinding[] {
  const groups = new Map<string, RawFinding>();
  for (const f of perFile) {
    const key = `${f.type}\0${f.segmentId}`;
    const g = groups.get(key);
    if (!g) { groups.set(key, { ...f, id: findingId(f.type, f.segmentId), files: [f.file], secrets: f.secrets ? [...f.secrets] : undefined }); continue; }
    g.files.push(f.file);
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[g.severity]) g.severity = f.severity;
    const details = new Set([...g.detail.split(", "), ...f.detail.split(", ")]);
    g.detail = [...details].join(", ");
    if (f.secrets) g.secrets = [...new Set([...(g.secrets ?? []), ...f.secrets])];
  }
  return [...groups.values()];
}

function sha1FileSafe(f: string): string { try { return sha1File(f); } catch { return ""; } }
