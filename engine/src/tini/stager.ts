// On Approve: create a fresh workspace and carry cleaned copies of every approved
// folder into ./assets/<segmentId>/. Originals are never modified: we only read them.
// Copies lose their GPS (and nothing else: Tina's Photos finding relies on the rest).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { exiftool } from "exiftool-vendored";
import type { Ev } from "../crew.ts";
import { pretty, type Fence } from "../guard.ts";
import { kindOf } from "../tina/preinspect.ts";
import { projectsRoot, type Plan } from "./planner.ts";

export interface Staged {
  fence: Fence;
  workspace: string;
  pathMap: Record<string, string>;   // "~/Clients/Rivera/Photos" -> "./assets/photos"
  fenceNote: string;                 // appended to Claude's system prompt
  /** sha1 of every asset copy as staged (workspace-relative path). Tina treats an unchanged, unreferenced copy as input, not output. */
  baseline?: Record<string, string>;
}

export function sha1File(file: string): string {
  return crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
}

/** Records the current bytes of these workspace files as "as staged". */
export function recordBaseline(staged: { workspace: string; baseline?: Record<string, string> }, absFiles: string[]): void {
  staged.baseline ??= {};
  for (const f of absFiles) { try { staged.baseline[path.relative(staged.workspace, f)] = sha1File(f); } catch { /* removed (e.g. couldn't be cleaned) */ } }
}

/** Removes GPS only (EXIF GPS IFD and XMP GPS tags). Everything else stays. */
export async function stripGps(file: string): Promise<void> {
  await exiftool.write(file, {}, { writeArgs: ["-gps:all=", "-xmp:gps*=", "-overwrite_original"] });
}

export async function stageFence(plan: Plan, emit: (ev: Ev) => void): Promise<Staged> {
  const root = projectsRoot();
  fs.mkdirSync(root, { recursive: true });
  let workspace = path.join(root, plan.workspaceName);
  if (fs.existsSync(workspace)) {           // name was taken after planning: pick the next free one
    let n = 2;
    while (fs.existsSync(`${workspace}-${n}`)) n++;
    workspace = `${workspace}-${n}`;
  }
  fs.mkdirSync(path.join(workspace, "assets"), { recursive: true });
  workspace = fs.realpathSync(workspace);

  const pathMap: Record<string, string> = {};
  const noteLines: string[] = [];
  const copiedAll: string[] = [];

  for (const seg of plan.segments) {
    if (seg.kind === "folder") {
      const src = plan.sources.find((s) => s.segmentId === seg.id);
      const insp = plan.inspections.find((i) => i.segmentId === seg.id);
      if (!src || !insp) continue;
      const destDir = path.join(workspace, "assets", seg.id);
      fs.mkdirSync(destDir, { recursive: true });
      const strips: Promise<unknown>[] = [];
      let dropped = 0;
      // Copy exactly the files Tina listed (risky files, symlinks, .DS_Store were left out).
      for (const rel of insp.files) {
        const from = insp.isDir ? path.join(src.realPath, rel) : src.realPath;
        const to = path.join(destDir, rel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
        copiedAll.push(to);
        // Strip every image copy, not just the ones Tina saw GPS in. Fail closed: a copy
        // whose GPS can't be removed is deleted rather than handed to Claude.
        if (kindOf(rel) === "image") strips.push(stripGps(to).catch(() => { fs.rmSync(to, { force: true }); dropped++; }));
      }
      await Promise.all(strips);
      if (dropped) emit({ actor: "system", type: "raw.log", channel: "engine", text: `stager: ${dropped} image(s) in ${seg.id} couldn't be cleaned and were left out` });
      const rel = `./assets/${seg.id}` + (insp.isDir ? "" : `/${path.basename(src.realPath)}`);
      pathMap[pretty(src.realPath)] = rel;
      noteLines.push(`- ${rel}: ${seg.label} (${seg.detail})`);
      emit({ actor: "tini", type: "fence.segment.built", segment: { ...seg, status: "built" } });
      emit({ actor: "tini", type: "tini.carry.box", segmentId: seg.id, fileCount: insp.files.length - dropped });
    } else if (seg.kind === "workspace") {
      emit({ actor: "tini", type: "fence.segment.built", segment: { ...seg, detail: pretty(workspace), status: "built" } });
    } else {
      emit({ actor: "tini", type: "fence.segment.built", segment: { ...seg, status: "built" } });
    }
  }

  const fence: Fence = { workspace, allowedDomains: [...plan.allowedDomains] };
  const staged: Staged = { fence, workspace, pathMap, fenceNote: fenceNote(workspace, noteLines, plan.allowedDomains) };
  recordBaseline(staged, copiedAll);
  return staged;
}

function fenceNote(workspace: string, assetLines: string[], domains: string[]): string {
  return [
    "## Tini's fence (read this first)",
    `You are working in a fresh project folder: ${workspace}. It is your whole world for this job.`,
    assetLines.length
      ? "The owner approved these files. They are copies, already inside your folder (photo GPS locations removed):\n" + assetLines.join("\n")
      : "The owner didn't approve any existing files for this job.",
    "When the owner's message mentions a ./assets path, that is the approved copy; use it.",
    "Everything outside this folder is off limits, and attempts to reach it are blocked and logged.",
    domains.length ? `Network access: only ${domains.join(", ")}.` : "Network access: none.",
    "If you truly need something outside the fence, say so in one sentence and keep working with what you have. The owner reviews requests, and approved files appear in ./assets/.",
  ].join("\n");
}
