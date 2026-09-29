// The Crew: everything Tini, Tina and the dog actually do. project.ts owns the
// phases, the turn loop and emit(); the crew only does the work. standins.ts is a
// test crew with no Claude or AI calls; live.ts composes the real modules.
import type {
  AccessReport, Actor, ContractCard, EngineEvent, EscalationOption, Finding, InspectionHighlight, Segment, WorldState,
} from "../../shared/events.ts";
import type { Ask } from "./ai.ts";

/** An event before emit() stamps it with seq and ts. */
export type Ev = EngineEvent extends infer E ? (E extends EngineEvent ? Omit<E, "seq" | "ts"> : never) : never;
export type RawChannel = Extract<EngineEvent, { type: "raw.log" }>["channel"];
export type Choice = EscalationOption["id"];
export type EscalationSource = "agent" | "prompt";

export interface CrewCtx {
  emit(ev: Ev): void;
  say(actor: Actor, text: string): void;
  log(channel: RawChannel, text: string): void;
  /** Opens an escalation card (Tina inspects first) and resolves with Maria's choice. Stop resolves it as "deny". */
  escalate(requested: string, source: EscalationSource): Promise<Choice>;
  /** Aborted by Stop (this turn) or Reset (everything). */
  signal: AbortSignal;
  ai: Ask;
  state(): WorldState;
  /** This session's events so far (for the access report). */
  events?(): readonly EngineEvent[];
}

export interface FencePlan { segments: Segment[]; contract: ContractCard }
export interface EscalationCard { ask: string; inspection: { totalFiles: number; highlights: InspectionHighlight[] }; options: EscalationOption[] }
export interface OpenEscalation { escalationId: string; requested: string; source: EscalationSource; card: EscalationCard }

export interface Crew {
  /** Turn 1: Tini writes the fence from the prompt (+ any Adjust texts). Tina's folder pre-inspection happens here too. */
  plan(ctx: CrewCtx, prompt: string, adjustments: string[]): Promise<FencePlan>;
  /** On Approve: create the workspace, copy folders in cleaned, emit fence.segment.built + tini.carry.box. */
  stage(ctx: CrewCtx, plan: FencePlan): Promise<void>;
  /** Later turns: code-only check. Returns the paths in the prompt that are outside the fence. */
  access(ctx: CrewCtx, text: string): Promise<string[]>;
  /** Tina inspects a requested folder; returns the card's contents. */
  inspectRequest(ctx: CrewCtx, requested: string, source: EscalationSource): Promise<EscalationCard>;
  /** Carries out Maria's choice (stage the subset, add the segment). Returns the note Claude gets, if any. */
  applyEscalation(ctx: CrewCtx, esc: OpenEscalation, choice: Choice): Promise<{ note?: string }>;
  /** Sends one message into the dog's session and resolves at Claude's result, with its short summary. */
  runTurn(ctx: CrewCtx, message: string, info: { turnId: number; followUp: boolean }): Promise<string>;
  /** Tina's per-turn inspection. May emit tina.inspect.segment as she walks; returns the findings. */
  inspect(ctx: CrewCtx, segments: Segment[]): Promise<Finding[]>;
  /** Applies one fix (then rescans). Returns the summary line. */
  fix(ctx: CrewCtx, finding: Finding, fixId: string): Promise<string>;
  /** Releases the result. */
  launch(ctx: CrewCtx): Promise<{ url?: string; report: AccessReport }>;
  /** Reset: forget everything about the current project. */
  reset?(): void;
  /** The simulated attack (harness.ts): pushes the template's ~/.ssh read through the real fence. */
  attack?(ctx: CrewCtx): string;
}
