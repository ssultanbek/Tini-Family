// Stand-in crew: realistic events with no Claude, no files, no AI calls, so the
// turn loop can be tested end to end. Each function is replaced by the real module
// in Stages 3-7. Covers: an agent escalation mid-turn (the dog keeps working while
// it's open), prompt-sourced escalations for ~/ paths, one simulated attack block,
// two reds in turn 1 with fixes, and all-green later turns. `speed` scales delays.
import type { AccessReport, Finding, Segment } from "../../shared/events.ts";
import type { Crew, CrewCtx, EscalationCard, FencePlan } from "./crew.ts";

const seg = (id: string, label: string, kind: Segment["kind"], detail: string): Segment => ({ id, label, kind, detail, status: "planned" });
const SEGMENTS: Segment[] = [
  seg("photos", "Photos", "folder", "31 photos, locations removed"),
  seg("about", "About", "folder", "2 documents"),
  seg("services", "Services", "folder", "1 document"),
  seg("web-packages", "Web packages", "packages", "npm registry only"),
  seg("workspace", "Workspace", "workspace", "~/tini-projects/rivera-site"),
];
const FENCED_ROOTS = ["~/Clients/Rivera", "~/tini-projects/rivera-site"];

const KEY_FINDING: Finding = {
  id: "f-key", segmentId: "web-packages", severity: "high",
  title: "API key in your website's code",
  explanation: "script.js contains a Google Maps key that anyone visiting the site can copy and bill to your account.",
  file: "script.js",
  fixes: [{ id: "move-key-to-env", label: "Move key out of the website" }, { id: "remove-file", label: "Remove the map" }],
};
const FACE_FINDING: Finding = {
  id: "f-face", segmentId: "photos", severity: "medium",
  title: "A worker's face and a license plate in one photo",
  explanation: "crew-truck.jpg shows a worker's face and a readable license plate. Publishing it could identify them.",
  file: "assets/crew-truck.jpg",
  fixes: [{ id: "blur", label: "Blur face and plate" }, { id: "remove-file", label: "Remove this photo" }],
};

const JOBSITE_CARD: EscalationCard = {
  ask: "Claude wants more job-site photos for the gallery.",
  inspection: { totalFiles: 1212, highlights: [
    { label: "job-site photos", count: 12, severity: "low" },
    { label: "personal photos", count: 1199, severity: "medium" },
    { label: "driver's license scan", count: 1, severity: "high" },
    { label: "photos with GPS location", count: 903, severity: "medium" },
  ] },
  options: [
    { id: "narrow", label: "Allow only the 12 job-site photos", detail: "Locations removed. Personal photos and the license stay out.", recommended: true },
    { id: "all", label: "Allow the whole folder", detail: "All 1,212 files, including the license scan.", recommended: false },
    { id: "deny", label: "Deny", detail: "Claude keeps building with what it has.", recommended: false },
  ],
};
const folderCard = (requested: string): EscalationCard => ({
  ask: "Your new request needs a folder that isn't inside the fence yet.",
  inspection: { totalFiles: 8, highlights: [{ label: "documents", count: 7, severity: "low" }, { label: "file with a password in it", count: 1, severity: "high" }] },
  options: [
    { id: "narrow", label: "Allow the 7 documents", detail: "The file with a password stays out.", recommended: true },
    { id: "all", label: "Allow the whole folder", detail: `All 8 files in ${requested}.`, recommended: false },
    { id: "deny", label: "Deny", detail: "Claude works without it.", recommended: false },
  ],
});

/** Segment id for a folder added by escalation: "~/Pictures/Jobsite2024" -> "jobsite2024". */
export const folderSlug = (p: string) => (p.split("/").filter(Boolean).pop() ?? "folder").toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Sleeps `ms / speed`, rejecting with AbortError on Stop/Reset. */
function nap(ms: number, speed: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(Object.assign(new Error("aborted"), { name: "AbortError" })); return; }
    const t = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms / speed);
    const onAbort = () => { clearTimeout(t); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function standinCrew(speed = 1): Crew {
  let inspections = 0;
  const narrowed: AccessReport["narrowed"] = [];
  const allowedExtra: AccessReport["allowed"] = [];
  const fixed: AccessReport["fixed"] = [];

  const brick = async (ctx: CrewCtx, op: "read" | "write" | "edit" | "run", file: string, ms = 700) => {
    await nap(ms, speed, ctx.signal);
    ctx.emit({ actor: "dog", type: "dog.brick.placed", op, file, bricks: ctx.state().bricks + 1 });
  };
  const slug = folderSlug;

  return {
    attack(ctx) {
      ctx.log("hook", "[simulated] PreToolUse Read ~/.ssh/id_rsa -> DENY (outside workspace)");
      ctx.emit({ actor: "dog", type: "fence.blocked", target: "~/.ssh/id_rsa", tool: "Read", layer: "hook", simulated: true,
        reason: "A downloaded template told Claude to read your SSH key. That's outside the fence, so Tini blocked it." });
      return "blocked";
    },

    reset() { inspections = 0; narrowed.length = 0; allowedExtra.length = 0; fixed.length = 0; },

    async plan(ctx, _prompt, adjustments): Promise<FencePlan> {
      ctx.say("tini", "Let me see what this job needs...");
      await nap(900, speed, ctx.signal);
      ctx.log("sdk", "standin: prompt -> fence manifest (5 segments)");
      ctx.emit({ actor: "tina", type: "tina.inspect.started", scope: "folder", segmentId: "photos" });
      await nap(900, speed, ctx.signal);
      ctx.say("tina", "31 photos have home GPS in them. I'll strip that.");
      ctx.emit({ actor: "tina", type: "tina.inspect.finished", scope: "folder", redCount: 0 });
      await nap(300, speed, ctx.signal);
      return {
        segments: SEGMENTS.map((s) => ({ ...s })),
        contract: {
          title: "Here's what Claude can use for this job",
          allowed: [
            "Photos from ~/Clients/Rivera/Photos (copies)", "About and Services documents (copies)",
            "Web packages from the npm registry", "A fresh project folder: ~/tini-projects/rivera-site",
            ...adjustments.map((a) => `Adjusted: ${a}`),
          ],
          stripped: ["31 photos contain GPS locations, removed before Claude sees them"],
          outside: "Everything else on your Mac stays outside the fence.",
        },
      };
    },

    async stage(ctx, plan) {
      ctx.log("config", 'sandbox.filesystem: {"denyRead":["~/"],"allowRead":["~/tini-projects/rivera-site"]}');
      for (const g of plan.segments) {
        await nap(700, speed, ctx.signal);
        ctx.emit({ actor: "tini", type: "fence.segment.built", segment: g });
        if (g.kind === "folder") {
          await nap(500, speed, ctx.signal);
          ctx.emit({ actor: "tini", type: "tini.carry.box", segmentId: g.id, fileCount: g.id === "photos" ? 31 : 2 });
        }
      }
      await nap(500, speed, ctx.signal);
    },

    async access(ctx, text) {
      // Same shape as the real Stage 3 check: code only, paths in the prompt vs the fence.
      await nap(300, speed, ctx.signal);
      const paths = [...text.matchAll(/~\/[^\s,;"'()]+/g)].map((m) => m[0].replace(/[.:!?]+$/, ""));
      return [...new Set(paths)].filter((p) => !FENCED_ROOTS.some((r) => p === r || p.startsWith(r + "/")));
    },

    async inspectRequest(ctx, requested) {
      await nap(1500, speed, ctx.signal);
      return requested.includes("Jobsite") ? JOBSITE_CARD : folderCard(requested);
    },

    async applyEscalation(ctx, esc, choice) {
      if (choice === "deny") return { note: `Note: the owner did not allow ${esc.requested}. Work without it.` };
      const id = slug(esc.requested);
      const narrow = choice === "narrow";
      const jobsite = esc.requested.includes("Jobsite");
      const count = jobsite ? (narrow ? 12 : 1212) : narrow ? 7 : 8;
      const g = seg(id, jobsite ? "Job-site photos" : id.replace(/-/g, " "), "folder", jobsite ? (narrow ? "12 photos, locations removed" : "1,212 files") : narrow ? "7 documents" : "8 files");
      await nap(400, speed, ctx.signal);
      ctx.emit({ actor: "tini", type: "fence.segment.built", segment: g });
      await nap(500, speed, ctx.signal);
      ctx.emit({ actor: "tini", type: "tini.carry.box", segmentId: id, fileCount: count });
      if (narrow) narrowed.push({ what: esc.requested, why: jobsite ? "Only 12 job-site photos, locations removed" : "Only the 7 documents; the password file stayed out" });
      else allowedExtra.push({ what: esc.requested, why: "You allowed the whole folder" });
      return { note: `Approved files from ${esc.requested} are now in ./assets/${id}/.` };
    },

    async runTurn(ctx, message, { turnId, followUp }) {
      if (turnId === 1 && !followUp) {
        for (const [op, f] of [["read", "assets/about/about.md"], ["read", "assets/services/services.md"], ["write", "index.html"], ["write", "styles.css"]] as const) await brick(ctx, op, f);
        // the poisoned template tries to reach ~/.ssh (harness, labelled simulated)
        await nap(800, speed, ctx.signal);
        ctx.log("hook", "PreToolUse Read ~/.ssh/id_rsa -> DENY (outside workspace)");
        ctx.emit({ actor: "dog", type: "fence.blocked", target: "~/.ssh/id_rsa", tool: "Read", layer: "hook", simulated: true,
          reason: "A downloaded template told Claude to read your SSH key. That's outside the fence, so Tini blocked it." });
        await nap(1200, speed, ctx.signal);
        ctx.say("tini", "Nope. Not your house, buddy.");
        await brick(ctx, "write", "script.js");
        await brick(ctx, "edit", "index.html");
        // Claude asks for a folder nobody named: denied by the hook, escalated, and the dog keeps working.
        await nap(800, speed, ctx.signal);
        ctx.emit({ actor: "dog", type: "fence.blocked", target: "~/Pictures/Jobsite2024", tool: "Glob", layer: "hook", simulated: false,
          reason: "Claude asked for a folder you didn't name. Tini is asking you first." });
        ctx.escalate("~/Pictures/Jobsite2024", "agent").catch(() => {});
        await brick(ctx, "write", "gallery.html", 2500);
        await brick(ctx, "run", "npx serve --version");
        return "Built a 3-page site: home, services, gallery.";
      }
      if (followUp) {
        const dir = message.match(/\.\/assets\/([^/\s]+)\//)?.[1] ?? "extra";
        await brick(ctx, "read", `assets/${dir}/photo-03.jpg`);
        await brick(ctx, "edit", "gallery.html");
        return "Added the approved job-site photos to the gallery.";
      }
      const page = /gallery/i.test(message) ? "gallery.html" : `page-${turnId}.html`;
      for (const [op, f] of [["read", "index.html"], ["write", page], ["edit", "styles.css"]] as const) await brick(ctx, op, f); // 3 per turn, like the mock
      return `Done: ${message.split("\n")[0].slice(0, 60)}`;
    },

    async inspect(ctx, segments) {
      inspections++;
      for (const g of segments) {
        await nap(inspections === 1 ? 800 : 300, speed, ctx.signal);
        ctx.emit({ actor: "tina", type: "tina.inspect.segment", segmentId: g.id });
      }
      return inspections === 1 ? [KEY_FINDING, FACE_FINDING] : [];
    },

    async fix(ctx, finding, fixId) {
      await nap(600, speed, ctx.signal);
      const label = finding.fixes.find((x) => x.id === fixId)?.label ?? "Fixed";
      fixed.push({ what: finding.file ?? finding.title, why: label });
      return `${label}: done`;
    },

    async launch(ctx) {
      await nap(800, speed, ctx.signal);
      const s = ctx.state();
      return {
        url: "http://localhost:5050",
        report: {
          allowed: [{ what: "Photos, About, Services (copies)", why: "You named them in your request" }, { what: "npm registry", why: "Web packages for the site" }, ...allowedExtra],
          blocked: s.blocked.map((b) => ({ what: b.target, why: b.reason })),
          narrowed: [...narrowed],
          fixed: [...fixed],
          dataLeavesTo: ["fonts.googleapis.com"],
        },
      };
    },
  };
}
