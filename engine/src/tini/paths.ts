// Finding and judging paths and web addresses in Maria's prompt. Plain code, no AI.
// Used by the turn-1 planner and by the per-turn access check.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isInside, pretty, realish } from "../guard.ts";

export const HOME = os.homedir();

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------
const URL_RE = /\bhttps?:\/\/[^\s"'<>`)]+/gi;
// Bare domains only with a common TLD, so "index.html" or "sales-q3.csv" never count.
const DOMAIN_RE = /(?<![\w@./~-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|io|dev|app|co|ai|edu|gov|us|info|biz|me))(?![\w-])/gi;
const QUOTED_RE = /(["'`])((?:~|\/)[^"'`\n]*?)\1/g;
// ~/..., ~ alone, $HOME/..., or any absolute path (a letter must follow the first slash).
const PATH_RE = /(?<![\w.~/-])(?:~(?=\/|\s|$|[,;:!?)])|\$\{?HOME\}?|\/(?=[A-Za-z.]))[^\s"'`,;()<>]*/g;
const TRAILING = /[.,;:!?)\]}]+$/;

export interface Found { raw: string } // the text as Maria typed it (trailing punctuation removed)

/** Paths in a prompt, in order, de-duplicated. URLs are removed first so their paths don't count. */
export function extractPaths(prompt: string): string[] {
  const out: string[] = [];
  let text = prompt.replace(URL_RE, " ");
  text = text.replace(QUOTED_RE, (_m, _q, p: string) => { out.push(p.trim()); return " "; });
  for (const m of text.matchAll(PATH_RE)) {
    const p = m[0].replace(TRAILING, "");
    if (p && p !== "/") out.push(p);
  }
  return [...new Set(out)];
}

/** Hostnames from URLs, plus bare domains like fonts.googleapis.com. Lower-cased, de-duplicated. */
export function extractDomains(prompt: string): string[] {
  const hosts: string[] = [];
  for (const m of prompt.matchAll(URL_RE)) {
    try { hosts.push(new URL(m[0].replace(TRAILING, "")).hostname.toLowerCase()); } catch { /* not a URL */ }
  }
  const rest = prompt.replace(URL_RE, " ");
  for (const m of rest.matchAll(DOMAIN_RE)) hosts.push(m[1].toLowerCase());
  return [...new Set(hosts)];
}

// ---------------------------------------------------------------------------
// Resolution and judgement
// ---------------------------------------------------------------------------
export function expandHome(p: string): string {
  if (p === "~") return HOME;
  if (p.startsWith("~/")) return path.join(HOME, p.slice(2));
  return p.replace(/^\$\{?HOME\}?/, HOME);
}

const SENSITIVE_DIRS = [".ssh", ".aws", ".gnupg", ".config", ".kube", ".docker", ".tini", ".claude", ".password-store"];
const SENSITIVE_FILES = [/^\.env(\..*)?$/i, /^\.netrc$/, /^\.npmrc$/, /^\.git-credentials$/, /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/, /\.pem$/i, /\.p12$/i];
const SENSITIVE_LIBRARY = ["Library/Keychains", "Library/Cookies", "Library/Mail", "Library/Messages"];

/** Why this absolute path is off limits, or null if it isn't. */
export function sensitiveReason(abs: string): string | null {
  if (abs === HOME) return "your whole home folder";
  if (isInside(HOME, abs)) return "a folder that contains your whole home folder";
  if (!isInside(abs, HOME)) return "outside your home folder";
  const parts = path.relative(HOME, abs).split(path.sep);
  if (parts.some((p) => SENSITIVE_DIRS.includes(p))) return "where keys and credentials live";
  if (parts.some((p) => SENSITIVE_FILES.some((re) => re.test(p)))) return "a file that holds secret keys";
  const rel = parts.join("/");
  if (SENSITIVE_LIBRARY.some((l) => rel === l || rel.startsWith(l + "/"))) return "private app data";
  return null;
}

export type Judged =
  | { ok: true; raw: string; abs: string; display: string; isDir: boolean }
  | { ok: false; raw: string; abs: string; display: string; why: "missing" | "sensitive"; reason: string };

/**
 * Resolves one path from a prompt and decides if it can go inside the fence.
 * "/Clients/Rivera/Photos" (no ~) is read as home-relative when only that version exists.
 * Symlinks are followed before judging, so a link can't smuggle in ~/.ssh.
 */
export function judgePath(raw: string): Judged {
  let abs = path.resolve(expandHome(raw));
  if (!fs.existsSync(abs) && raw.startsWith("/") && !isInside(abs, HOME) && fs.existsSync(path.join(HOME, raw))) {
    abs = path.join(HOME, raw);
  }
  const exists = fs.existsSync(abs);
  const real = exists ? fs.realpathSync(abs) : realish(abs);
  const display = pretty(real);
  // Judge both the typed path and where it really points.
  const reason = sensitiveReason(abs) ?? sensitiveReason(real);
  if (reason) return { ok: false, raw, abs: real, display: pretty(abs), why: "sensitive", reason };
  if (!exists) return { ok: false, raw, abs: real, display, why: "missing", reason: "doesn't exist" };
  return { ok: true, raw, abs: real, display, isDir: fs.statSync(real).isDirectory() };
}

/** Drops paths that sit inside another path in the list (keeps the outer one). */
export function outermost<T extends { abs: string }>(items: T[]): T[] {
  return items.filter((a, i) => !items.some((b, j) => j !== i && b.abs !== a.abs && isInside(a.abs, b.abs)))
    .filter((a, i, arr) => arr.findIndex((b) => b.abs === a.abs) === i);
}

export function slug(s: string, max = 40): string {
  return s.toLowerCase().replace(/\.[a-z0-9]{1,5}$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
}
