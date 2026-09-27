// ============================================================================
// TINI FAMILY EVENT CONTRACT  (v1.3)
// Only Sultan edits this file. The game imports it; it never adds to it.
// Engine -> game: "event" messages (EngineEvent) and one "snapshot" on connect.
// Game -> engine: "command" messages (GameCommand). Clicks only, never decisions.
// A project is long-lived: Maria sends many prompts (turns) into the same fence,
// for any kind of task, not just websites. Nothing here assumes a single prompt.
// No pixel positions anywhere: only segment ids and zones.
// ============================================================================

export const PROTOCOL_VERSION = 1;
export const ENGINE_PORT = 4000;
export const SOCKET = { event: "event", command: "command", snapshot: "snapshot" } as const;

export type Zone = "gate" | "yard" | "house" | "outside";
export type Actor = "tini" | "tina" | "dog" | "system";
export type SessionMode = "live" | "replay" | "observe" | "mock";   // v1.4
export type Phase = "idle" | "planning" | "contract" | "fencing" | "building" | "inspecting" | "ready" | "launched";
export type SegmentKind = "folder" | "packages" | "workspace" | "network";
export type SegmentStatus = "planned" | "built" | "inspecting" | "red" | "green";
export type Severity = "high" | "medium" | "low";

export interface Segment {
  id: string;            // stable id, e.g. "photos", "about", "services", "web-packages", "workspace", "jobsite-photos"
  label: string;         // text painted on the fence: "Photos"
  kind: SegmentKind;
  detail: string;        // one line under the label: "31 photos, locations removed"
  status: SegmentStatus;
}

export interface ContractCard {
  title: string;         // "Here's what Claude can use"
  allowed: string[];     // plain-English lines
  stripped: string[];    // "31 photos contain GPS locations, removed before Claude sees them"
  outside: string;       // "Everything else on your Mac stays outside the fence."
}

export interface InspectionHighlight { label: string; count: number; severity: Severity }

export interface EscalationOption {
  id: "narrow" | "all" | "deny";
  label: string;         // "Allow only the 12 job-site photos"
  detail: string;        // "Locations removed. The license scan stays out."
  recommended: boolean;
}

export interface FixOption { id: string; label: string } // "strip-exif", "move-key-to-env", "remove-file", "blur"

export interface Finding {
  id: string;
  segmentId: string;
  severity: Severity;
  title: string;         // "API key in your website's code"
  explanation: string;   // 1-2 plain sentences (Gemini-written)
  file?: string;         // workspace-relative, for raw view
  fixes: FixOption[];
}

export interface ReportLine { what: string; why: string }
export interface AccessReport {
  allowed: ReportLine[];
  blocked: ReportLine[];
  narrowed: ReportLine[];
  fixed: ReportLine[];
  dataLeavesTo: string[]; // outside servers the site calls (display only)
}

/** Every event carries these. seq is strictly increasing per session. */
interface Base { seq: number; ts: number; actor: Actor }

export type EngineEvent = Base & (
  | { type: "session.reset" }
  | { type: "session.phase"; phase: Phase }
  | { type: "session.mode"; mode: SessionMode }                       // v1.4: what is driving the game (after startup and every reset)
  | { type: "user.prompt"; text: string }
  | { type: "turn.started"; turnId: number; prompt: string }          // one per prompt Maria sends; the house keeps growing across turns
  | { type: "turn.finished"; turnId: number; summary: string }        // Claude's short summary of what it did this turn
  | { type: "speech"; text: string }                                   // speech bubble over `actor`, ~2-3s
  | { type: "fence.plan.proposed"; segments: Segment[]; contract: ContractCard }
  | { type: "fence.plan.approved" }
  | { type: "fence.segment.built"; segment: Segment }                  // also used for segments added later
  | { type: "tini.carry.box"; segmentId: string; fileCount: number }   // Tini carries files from gate into yard
  | { type: "dog.state"; state: "sleeping" | "working" | "waiting" | "done" }
  | { type: "dog.brick.placed"; op: "read" | "write" | "edit" | "run"; file: string; bricks: number } // bricks = running total
  | { type: "fence.blocked"; target: string; reason: string; layer: "hook" | "os-sandbox"; tool: string; segmentId?: string; simulated: boolean }
  | { type: "escalation.opened"; escalationId: string; source?: "agent" | "prompt"; requested: string; ask: string; inspection: { totalFiles: number; highlights: InspectionHighlight[] }; options: EscalationOption[] }
  | { type: "escalation.resolved"; escalationId: string; choice: EscalationOption["id"]; summary: string }
  | { type: "tina.inspect.started"; scope: "folder" | "final"; segmentId?: string }
  | { type: "tina.inspect.segment"; segmentId: string }                // Tina walks to this segment and looks
  | { type: "segment.red"; segmentId: string; finding: Finding }
  | { type: "fix.applied"; findingId: string; fixId: string; summary: string }
  | { type: "finding.cleared"; findingId: string; reason: string }      // v1.3: a finding went away on a rescan without a fix click
  | { type: "segment.green"; segmentId: string }
  | { type: "tina.inspect.finished"; scope: "folder" | "final"; redCount: number }
  | { type: "launch.unlocked" }
  | { type: "launch.locked"; reason: string }                          // new work since the last inspection; Tina must re-check before anything leaves
  | { type: "launch.done"; url?: string; note?: string }             // v1.4 note: e.g. a replay whose site folder isn't on this machine
  | { type: "report.ready"; report: AccessReport }
  | { type: "raw.log"; channel: "hook" | "config" | "sdk" | "scan" | "ai" | "engine"; text: string } // raw-view toggle only; "ai" = AI ladder, "engine" = ignored commands etc. (v1.2)
  | { type: "prompt.suggested"; text: string }                        // v1.2: replay pre-fills the prompt bar; the presenter just presses Send
  | { type: "engine.error"; message: string }
);

export type EngineEventType = EngineEvent["type"];

export type GameCommand =
  | { type: "start"; prompt: string }       // first prompt: creates the project and its fence
  | { type: "prompt"; text: string }        // every later prompt in the same project
  | { type: "approve.plan" }
  | { type: "adjust.plan"; text: string }
  | { type: "escalation.choose"; escalationId: string; optionId: EscalationOption["id"] }
  | { type: "fix.apply"; findingId: string; fixId: string }
  | { type: "launch" }
  | { type: "stop" }                        // v1.2: ends the running turn ("Stopped by you"); Tina still inspects
  | { type: "reset" };

/** Everything the game needs to draw the world right now (sent on connect/reconnect). */
export interface WorldState {
  seq: number;
  phase: Phase;
  prompt: string | null;          // latest prompt
  turns: { id: number; prompt: string; summary?: string }[];
  segments: Segment[];
  contract: ContractCard | null;
  dog: "sleeping" | "working" | "waiting" | "done";
  bricks: number;
  blocked: Extract<EngineEvent, { type: "fence.blocked" }>[];
  openEscalation: Extract<EngineEvent, { type: "escalation.opened" }> | null;
  findings: Finding[];            // unresolved only
  launchUnlocked: boolean;
  report: AccessReport | null;
  rawLog: string[];               // last 200 lines
  suggestedPrompt?: string | null; // v1.2: pre-filled prompt text (replay); cleared by user.prompt
  mode?: SessionMode | null;        // v1.4: set by session.mode
}
