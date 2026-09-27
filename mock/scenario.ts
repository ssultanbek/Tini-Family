// The Rivera Construction story as a script. Mirrors what the real engine will
// emit, so the game can be built end to end before the engine exists.
import type { EngineEvent, GameCommand, Segment, Finding } from "../shared/events.ts";

export type Ev = EngineEvent extends infer E ? (E extends EngineEvent ? Omit<E, "seq" | "ts"> : never) : never;
export type Step =
  | { wait: number; ev: Ev }
  | { gate: GameCommand["type"]; then?: (cmd: GameCommand) => Step[] }
  | { lazy: () => Step[] };

const seg = (id: string, label: string, kind: Segment["kind"], detail: string): Segment =>
  ({ id, label, kind, detail, status: "planned" });

const SEGMENTS: Segment[] = [
  seg("photos", "Photos", "folder", "31 photos, locations removed"),
  seg("about", "About", "folder", "2 documents"),
  seg("services", "Services", "folder", "1 document"),
  seg("web-packages", "Web packages", "packages", "npm registry only"),
  seg("workspace", "Workspace", "workspace", "~/tini-projects/rivera-site"),
];

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

const s = (wait: number, ev: Ev): Step => ({ wait, ev });
let brickTotal = 0; // the house keeps growing across turns

// v1.2: replay pre-fills the prompt bar before each prompt gate (turn id -> text).
export const SUGGESTED: Record<number, string> = {
  1: "Build a modern, serious-looking website for Rivera Construction with a gallery of this year's projects and a map of our office on the Contact page. Use our Google Maps key from the About folder so our custom pin shows. Use the photos in ~/Clients/Rivera/Photos and the company info in ~/Clients/Rivera/About and ~/Clients/Rivera/Services.",
  2: "Add this year's job-site photos from ~/Pictures/Jobsite2024 to the gallery.",
  3: "Make the header darker.",
};
const suggest = (turnId: number): Step[] =>
  SUGGESTED[turnId] ? [s(0, { actor: "system", type: "prompt.suggested", text: SUGGESTED[turnId] })] : [];
const bricks = (_start: number, files: ["read" | "write" | "edit" | "run", string][]) =>
  files.map(([op, file]) => s(700, { actor: "dog", type: "dog.brick.placed", op, file, bricks: ++brickTotal }));

export function riveraScenario(): Step[] {
  let extra: Segment[] = []; // segments added by escalation, inspected at the end too
  brickTotal = 0;
  return [
    s(0, { actor: "system", type: "session.reset" }),
    s(0, { actor: "system", type: "session.phase", phase: "idle" }),
    s(0, { actor: "dog", type: "dog.state", state: "sleeping" }),
    ...suggest(1),
    { gate: "start", then: (cmd) => [
      s(0, { actor: "system", type: "user.prompt", text: cmd.type === "start" ? cmd.prompt : "" }),
      s(0, { actor: "system", type: "turn.started", turnId: 1, prompt: cmd.type === "start" ? cmd.prompt : "" }),
    ] },
    s(300, { actor: "system", type: "session.phase", phase: "planning" }),
    s(400, { actor: "tini", type: "speech", text: "Let me see what this job needs..." }),
    s(900, { actor: "system", type: "raw.log", channel: "sdk", text: "gemini: prompt -> fence manifest (5 segments)" }),
    s(300, { actor: "tina", type: "tina.inspect.started", scope: "folder", segmentId: "photos" }),
    s(900, { actor: "tina", type: "speech", text: "31 photos have home GPS in them. I'll strip that." }),
    s(300, { actor: "tina", type: "tina.inspect.finished", scope: "folder", redCount: 0 }),
    s(300, { actor: "tini", type: "fence.plan.proposed", segments: SEGMENTS, contract: {
      title: "Here's what Claude can use for this job",
      allowed: ["Photos from /Clients/Rivera/Photos (copies)", "About and Services documents (copies)", "Web packages from the npm registry", "A fresh project folder: ~/tini-projects/rivera-site"],
      stripped: ["31 photos contain GPS locations, removed before Claude sees them"],
      outside: "Everything else on your Mac stays outside the fence.",
    } }),
    s(0, { actor: "system", type: "session.phase", phase: "contract" }),
    { gate: "approve.plan" },
    s(0, { actor: "system", type: "fence.plan.approved" }),
    s(0, { actor: "system", type: "session.phase", phase: "fencing" }),
    s(0, { actor: "system", type: "raw.log", channel: "config", text: 'sandbox.filesystem: {"denyRead":["~/"],"allowRead":["~/tini-projects/rivera-site"]}' }),
    ...SEGMENTS.flatMap((g) => [
      s(700, { actor: "tini", type: "fence.segment.built", segment: g }),
      ...(g.kind === "folder" ? [s(500, { actor: "tini", type: "tini.carry.box", segmentId: g.id, fileCount: g.id === "photos" ? 31 : 2 } as Ev)] : []),
    ]),
    s(500, { actor: "system", type: "session.phase", phase: "building" }),
    s(0, { actor: "dog", type: "dog.state", state: "working" }),
    ...bricks(0, [["read", "assets/about.md"], ["read", "assets/services.md"], ["write", "index.html"], ["write", "styles.css"]]),
    // --- the poisoned template tries to reach ~/.ssh (scripted harness, labelled simulated) ---
    s(800, { actor: "system", type: "raw.log", channel: "hook", text: "PreToolUse Read ~/.ssh/id_rsa -> DENY (outside workspace)" }),
    s(0, { actor: "dog", type: "fence.blocked", target: "~/.ssh/id_rsa", tool: "Read", layer: "hook", simulated: true,
      reason: "A downloaded template told Claude to read your SSH key. That's outside the fence, so Tini blocked it." }),
    s(1200, { actor: "tini", type: "speech", text: "Nope. Not your house, buddy." }),
    ...bricks(4, [["write", "script.js"], ["edit", "index.html"]]),
    // --- escalation ---
    s(800, { actor: "dog", type: "dog.state", state: "waiting" }),
    s(0, { actor: "dog", type: "fence.blocked", target: "~/Pictures/Jobsite2024", tool: "Glob", layer: "hook", simulated: false,
      reason: "Claude asked for a folder you didn't name. Tini is asking you first." }),
    s(300, { actor: "tina", type: "tina.inspect.started", scope: "folder" }),
    s(1500, { actor: "tini", type: "escalation.opened", escalationId: "esc-1", source: "agent", requested: "~/Pictures/Jobsite2024",
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
      ] }),
    s(0, { actor: "dog", type: "dog.state", state: "working" }),
    ...bricks(6, [["write", "gallery.html"]]),
    { gate: "escalation.choose", then: (cmd) => {
      const choice = cmd.type === "escalation.choose" ? cmd.optionId : "deny";
      const summary = { narrow: "12 job-site photos copied in, locations removed", all: "Whole folder copied in (1,212 files)", deny: "Request denied" }[choice];
      const out: Step[] = [s(0, { actor: "system", type: "escalation.resolved", escalationId: "esc-1", choice, summary })];
      if (choice !== "deny") {
        extra = [seg("jobsite-photos", "Job-site photos", "folder", choice === "narrow" ? "12 photos, locations removed" : "1,212 files")];
        out.push(s(400, { actor: "tini", type: "fence.segment.built", segment: seg("jobsite-photos", "Job-site photos", "folder", choice === "narrow" ? "12 photos, locations removed" : "1,212 files") }));
        out.push(s(500, { actor: "tini", type: "tini.carry.box", segmentId: "jobsite-photos", fileCount: choice === "narrow" ? 12 : 1212 }));
      }
      return out;
    } },
    ...bricks(7, [["read", "assets/jobsite/photo-03.jpg"], ["edit", "gallery.html"], ["run", "npx serve --version"]]),
    s(800, { actor: "dog", type: "dog.state", state: "done" }),
    s(0, { actor: "dog", type: "turn.finished", turnId: 1, summary: "Built a 3-page site: home, services, gallery." }),
    // --- final inspection ---
    s(500, { actor: "system", type: "session.phase", phase: "inspecting" }),
    s(0, { actor: "tina", type: "tina.inspect.started", scope: "final" }),
    { lazy: () => [...SEGMENTS, ...extra].map((g) => s(800, { actor: "tina", type: "tina.inspect.segment", segmentId: g.id } as Ev)) },
    s(300, { actor: "tina", type: "segment.red", segmentId: "web-packages", finding: KEY_FINDING }),
    s(500, { actor: "tina", type: "segment.red", segmentId: "photos", finding: FACE_FINDING }),
    { lazy: () => [...SEGMENTS, ...extra].filter((g) => g.id !== "web-packages" && g.id !== "photos").map((g) => s(200, { actor: "tina", type: "segment.green", segmentId: g.id } as Ev)) },
    s(0, { actor: "tina", type: "tina.inspect.finished", scope: "final", redCount: 2 }),
    s(0, { actor: "system", type: "session.phase", phase: "ready" }), // like the engine: ready even with reds; launch stays locked
    s(200, { actor: "tina", type: "speech", text: "Two red spots. I can't launch like this." }),
    ...[0, 1].map((): Step => ({ gate: "fix.apply", then: (cmd) => {
      if (cmd.type !== "fix.apply") return [];
      const f = [KEY_FINDING, FACE_FINDING].find((x) => x.id === cmd.findingId) ?? KEY_FINDING;
      return [
        s(600, { actor: "tina", type: "fix.applied", findingId: f.id, fixId: cmd.fixId, summary: `${f.fixes.find((x) => x.id === cmd.fixId)?.label ?? "Fixed"}: done` }),
        s(300, { actor: "tina", type: "segment.green", segmentId: f.segmentId }),
      ];
    } })),
    s(400, { actor: "tina", type: "speech", text: "All green. Now you can launch." }),
    s(0, { actor: "system", type: "launch.unlocked" }),
    { gate: "launch" },
    s(800, { actor: "system", type: "launch.done", url: "http://localhost:5050" }),
    s(0, { actor: "system", type: "session.phase", phase: "launched" }),
    s(300, { actor: "system", type: "report.ready", report: {
      allowed: [{ what: "Photos, About, Services (copies)", why: "You named them in your request" }, { what: "npm registry", why: "Web packages for the site" }],
      blocked: [{ what: "~/.ssh/id_rsa", why: "A template tried to read your SSH key" }],
      narrowed: [{ what: "~/Pictures/Jobsite2024", why: "Only 12 job-site photos, locations removed" }],
      fixed: [{ what: "script.js", why: "API key moved out of the website" }, { what: "crew-truck.jpg", why: "Face and plate blurred" }],
      dataLeavesTo: ["fonts.googleapis.com"],
    } }),
    ...followUps(2, () => [...SEGMENTS, ...extra]),
  ];
}

// The prompt-sourced card: the demo's T2 names ~/Pictures/Jobsite2024; any other folder gets the
// Rivera-HR card (still covered by tests, out of the main recording).
function promptCard(folder: string) {
  if (/Jobsite2024/i.test(folder)) return {
    inspection: { totalFiles: 1212, highlights: [
      { label: "job-site photos", count: 12, severity: "low" as const },
      { label: "personal photos", count: 1199, severity: "medium" as const },
      { label: "driver's license scan", count: 1, severity: "high" as const },
      { label: "photos with GPS location", count: 903, severity: "medium" as const },
    ] },
    options: [
      { id: "narrow" as const, label: "Allow only the 12 job-site photos", detail: "Locations removed. Personal photos and the license stay out.", recommended: true },
      { id: "all" as const, label: "Allow the whole folder", detail: "All 1,212 files, including the license scan.", recommended: false },
      { id: "deny" as const, label: "Deny", detail: "Claude works without it.", recommended: false },
    ],
  };
  return {
    inspection: { totalFiles: 8, highlights: [{ label: "documents", count: 7, severity: "low" as const }, { label: "file with a password in it", count: 1, severity: "high" as const }] },
    options: [
      { id: "narrow" as const, label: "Allow the 7 documents", detail: "The file with a password stays out.", recommended: true },
      { id: "all" as const, label: "Allow the whole folder", detail: "All 8 files.", recommended: false },
      { id: "deny" as const, label: "Deny", detail: "Claude works without it.", recommended: false },
    ],
  };
}

// Maria keeps working in the same project. Each prompt is a new turn inside the
// same fence. If the prompt names a new folder (contains "~/"), Tini asks first.
function followUps(turnId: number, segs: () => Segment[]): Step[] {
  return [...suggest(turnId), { gate: "prompt", then: (cmd) => {
    const text = cmd.type === "prompt" ? cmd.text : "";
    const newFolder = text.match(/~\/[^\s,]+/)?.[0];
    const steps: Step[] = [
      s(0, { actor: "system", type: "user.prompt", text }),
      s(0, { actor: "system", type: "turn.started", turnId, prompt: text }),
      s(0, { actor: "system", type: "launch.locked", reason: "New work since Tina's last inspection" }),
      s(0, { actor: "system", type: "session.phase", phase: "planning" }),
    ];
    if (newFolder) {
      steps.push(
        s(600, { actor: "tini", type: "speech", text: `You mentioned ${newFolder}. That's outside the fence, let me check it.` }),
        s(0, { actor: "tina", type: "tina.inspect.started", scope: "folder" }),
        s(1200, { actor: "tini", type: "escalation.opened", escalationId: `esc-t${turnId}`, source: "prompt", requested: newFolder,
          ask: "Your new request needs a folder that isn't inside the fence yet.",
          ...promptCard(newFolder) }),
        { gate: "escalation.choose", then: (c) => {
          const choice = c.type === "escalation.choose" ? c.optionId : "deny";
          const out: Step[] = [s(0, { actor: "system", type: "escalation.resolved", escalationId: `esc-t${turnId}`, choice, summary: choice === "deny" ? "Request denied" : "Folder added" })];
          if (choice !== "deny") {
            const g = seg(`extra-${turnId}`, newFolder.split("/").pop() || "Folder", "folder", choice === "narrow" ? "7 documents" : "8 files");
            const before = segs;
            segs = () => [...before(), g];
            out.push(s(400, { actor: "tini", type: "fence.segment.built", segment: g }), s(400, { actor: "tini", type: "tini.carry.box", segmentId: g.id, fileCount: choice === "narrow" ? 7 : 8 }));
          }
          return out;
        } },
      );
    } else {
      steps.push(s(600, { actor: "tini", type: "speech", text: "Nothing new needed. Same fence." }));
    }
    steps.push(
      s(300, { actor: "system", type: "session.phase", phase: "building" }),
      s(0, { actor: "dog", type: "dog.state", state: "working" }),
      { lazy: () => bricks(100 * turnId, [["read", "index.html"], ["write", `page-${turnId}.html`], ["edit", "styles.css"]]) },
      s(600, { actor: "dog", type: "dog.state", state: "done" }),
      s(0, { actor: "dog", type: "turn.finished", turnId, summary: `Done: ${text.slice(0, 60)}` }),
      s(300, { actor: "system", type: "session.phase", phase: "inspecting" }),
      s(0, { actor: "tina", type: "tina.inspect.started", scope: "final" }),
      { lazy: () => segs().flatMap((g) => [s(300, { actor: "tina", type: "tina.inspect.segment", segmentId: g.id } as Ev), s(100, { actor: "tina", type: "segment.green", segmentId: g.id } as Ev)]) },
      s(0, { actor: "tina", type: "tina.inspect.finished", scope: "final", redCount: 0 }),
      s(0, { actor: "system", type: "session.phase", phase: "ready" }),
      s(0, { actor: "system", type: "launch.unlocked" }),
      { lazy: () => followUps(turnId + 1, segs) },
    );
    return steps;
  } }];
}
