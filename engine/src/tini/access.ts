// The per-turn access check and the prompt rewrite. Code only, no AI: instant, free,
// can't fail. Compares every path and web address in a later prompt to the fence.
import path from "node:path";
import { isInside, pretty } from "../guard.ts";
import { expandHome, extractDomains, extractPaths, HOME, judgePath } from "./paths.ts";
import type { Staged } from "./stager.ts";

export interface AccessResult {
  newFolders: string[];   // exist, are allowed in principle, but aren't inside the fence yet -> escalation
  sensitive: string[];    // hard block, no card (keys, credentials, home itself, outside home)
  newDomains: string[];   // web addresses not on the fence's list (network escalation is CUT: informational)
}

export function checkAccess(prompt: string, staged: Staged): AccessResult {
  const fenced = Object.keys(staged.pathMap).map((p) => path.resolve(expandHome(p)));
  const newFolders: string[] = [], sensitive: string[] = [];
  for (const raw of extractPaths(prompt)) {
    // ./assets paths and anything else relative are inside the workspace by definition.
    const j = judgePath(raw);
    if (!j.ok && j.why === "sensitive") { sensitive.push(j.display); continue; }
    if (!j.ok) continue;                                       // doesn't exist: nothing to hand over
    if (isInside(j.abs, staged.workspace)) continue;
    if (fenced.some((f) => isInside(j.abs, f))) continue;      // already inside an approved copy
    newFolders.push(j.display);
  }
  const newDomains = extractDomains(prompt).filter((d) => !staged.fence.allowedDomains.some((a) => d === a || d.endsWith("." + a)));
  return { newFolders: [...new Set(newFolders)], sensitive: [...new Set(sensitive)], newDomains };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Swaps Maria's real paths for their ./assets copies before the prompt reaches Claude.
 * Handles ~/x, /Users/me/x and the home-relative /x form, plus anything below them.
 */
export function rewritePrompt(prompt: string, pathMap: Record<string, string>): string {
  let out = prompt;
  const entries = Object.entries(pathMap).sort((a, b) => b[0].length - a[0].length);
  for (const [real, rel] of entries) {
    const abs = path.resolve(expandHome(real));
    const forms = [pretty(abs), abs];
    if (isInside(abs, HOME)) forms.push(abs.slice(HOME.length));  // "/Clients/Rivera/Photos"
    for (const form of forms) {
      const re = new RegExp(`(?<![\\w.~/-])${esc(form)}(?![\\w-])`, "g");
      out = out.replace(re, rel);
    }
  }
  return out;
}
