// Tini's fence guard. Pure decision logic, no SDK imports, so it can be unit
// tested and reused by the PreToolUse hook and the attack harness.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type GuardDecision =
  | { allow: true }
  | { allow: false; target: string; reason: string; kind: "path" | "tool" | "network" };

export interface Fence {
  workspace: string; // absolute, realpath'd
  allowedDomains: string[]; // e.g. ["registry.npmjs.org"]
}

const HOME = os.homedir();

// Paths the dog may touch outside the workspace without asking (toolchain, temp).
const SYSTEM_OK = [
  "/usr", "/bin", "/sbin", "/opt/homebrew", "/Library/Developer", "/System",
  "/dev/null", "/dev/stdout", "/dev/stderr", "/tmp", "/private/tmp", "/var/folders", "/private/var/folders",
];

// Tools the dog is allowed to use at all. Everything else is refused.
export const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"] as const;

// The request door: the one MCP tool the dog may call (in-process server "tini", tool
// "request_access"). It opens nothing; it only asks the owner. No other MCP tool is allowed.
export const REQUEST_TOOL = "mcp__tini__request_access";

/** realpath that works for files that don't exist yet (Write of a new file). */
export function realish(p: string): string {
  let cur = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...tail.reverse());
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}

export function expandHome(p: string): string {
  if (p === "~") return HOME;
  if (p.startsWith("~/")) return path.join(HOME, p.slice(2));
  return p.replace(/^\$\{?HOME\}?/, HOME);
}

export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Friendly display path: /Users/maria/.ssh/id_rsa -> ~/.ssh/id_rsa */
export function pretty(p: string): string {
  return isInside(p, HOME) ? "~" + p.slice(HOME.length) : p;
}

export function checkPath(raw: string, cwd: string, fence: Fence): GuardDecision {
  const resolved = realish(path.resolve(cwd, expandHome(raw)));
  if (isInside(resolved, fence.workspace)) return { allow: true };
  if (SYSTEM_OK.some((s) => isInside(resolved, s)) && !isInside(resolved, HOME)) return { allow: true };
  return {
    allow: false,
    kind: "path",
    target: pretty(resolved),
    reason: `${pretty(resolved)} is outside the fence. The owner only approved this project's workspace.`,
  };
}

// Pulls path-looking tokens out of a shell command. Best effort: the OS sandbox
// is the real backstop for anything this misses (see spike probe 3).
const PATH_TOKEN = /(?:~|\$\{?HOME\}?)(?:\/[^\s'";|&)<>]*)?|(?:^|[\s'"=:(<>])(\/[^\s'";|&)<>]+|\.\.(?:\/[^\s'";|&)<>]*)?)/g;

export function checkBash(command: string, cwd: string, fence: Fence): GuardDecision {
  // URLs and HTML closing tags (grep "</div>") aren't paths; "</etc/passwd" (an input redirect) still is.
  const noUrls = command.replace(/[a-z]+:\/\/[^\s'"]+/gi, "URL").replace(/<\/[a-z][a-z0-9-]*(?![a-z0-9/_.-])/gi, "TAG");
  for (const m of noUrls.matchAll(PATH_TOKEN)) {
    const token = (m[1] ?? m[0]).trim().replace(/^[\s'"=:(<>]+/, "");
    if (!token || /^\/+$/.test(token)) continue; // bare slashes are sed/regex syntax (s/a/b/, "//"), not a path
    const d = checkPath(token, cwd, fence);
    if (!d.allow) return d;
  }
  if (/\bcurl\b|\bwget\b/.test(command)) {
    const hosts = [...command.matchAll(/https?:\/\/([^/\s'"]+)/g)].map((m) => m[1]);
    const bad = hosts.find((h) => !fence.allowedDomains.some((d) => h === d || h.endsWith("." + d)));
    if (bad) return { allow: false, kind: "network", target: bad, reason: `${bad} is not on the list of websites the owner approved.` };
  }
  return { allow: true };
}

export function checkToolCall(tool: string, input: Record<string, unknown>, cwd: string, fence: Fence): GuardDecision {
  if (tool === REQUEST_TOOL) return { allow: true }; // asking is always allowed; the owner decides (sensitive paths are refused by its handler)
  if (!(ALLOWED_TOOLS as readonly string[]).includes(tool)) {
    return { allow: false, kind: "tool", target: tool, reason: `The ${tool} tool isn't part of this job.` };
  }
  switch (tool) {
    case "Read":
    case "Write":
    case "Edit":
      return checkPath(String(input.file_path ?? ""), cwd, fence);
    case "Glob":
    case "Grep": {
      const d = checkPath(String(input.path ?? cwd), cwd, fence);
      if (!d.allow) return d;
      if (tool === "Grep") return d; // Grep's pattern is a regex, not a path
      const pat = String(input.pattern ?? "");
      const root = pat.split(/[*?[{]/)[0];
      return root.startsWith("/") || root.startsWith("~") || root.includes("..") ? checkPath(root || "/", d.allow ? String(input.path ?? cwd) : cwd, fence) : d;
    }
    case "Bash":
      return checkBash(String(input.command ?? ""), cwd, fence);
  }
  return { allow: true };
}

// Private places the dog is never offered, even if the owner might say yes: dotfiles and
// dot-folders anywhere (~/.ssh, ~/.npmrc, .env), macOS Library, keys and credential stores.
const SENSITIVE = /(^|\/)(\.[^/]+|Library|id_[a-z0-9]+|[^/]+\.(pem|key|p12|pfx|kdbx|keychain(-db)?)|credentials?|keychains?|secrets?)(\/|$)/i;

/**
 * For a denied path (GuardDecision.target, e.g. "~/Pictures/Jobsite2024/IMG_1.jpg"), the
 * folder Tini may ask the owner about, or null if it must simply stay blocked.
 */
export function escalationFolder(target: string): string | null {
  if (!target.startsWith("~/")) return null;
  const rel = target.slice(2).replace(/\/+$/, "");
  if (!rel || SENSITIVE.test("/" + rel)) return null;
  const abs = path.join(HOME, rel);
  let folder = abs;
  try { if (!fs.statSync(abs).isDirectory()) folder = path.dirname(abs); }
  catch { if (/\.[a-z0-9]{1,5}$/i.test(abs)) folder = path.dirname(abs); }
  return folder === HOME ? null : pretty(folder);
}
