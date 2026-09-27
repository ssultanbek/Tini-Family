// The project: the Part 2 phase machine, the turn loop, and the ONLY emit().
// Every engine event goes through Hub.emit(): numbered, reduced, recorded, broadcast.
// Commands are checked against the current phase; an invalid one becomes a raw.log
// line (channel "engine"), never an engine.error. The crew (crew.ts) does the work.
import type { EngineEvent, Finding, GameCommand, Phase, WorldState } from "../../shared/events.ts";
import { initialState, reduce } from "../../shared/reducer.ts";
import type { Ask } from "./ai.ts";
import type { Choice, Crew, CrewCtx, EscalationSource, Ev, FencePlan, OpenEscalation } from "./crew.ts";
import type { Recorder } from "./recorder.ts";

// ---------------------------------------------------------------------------
// Hub: the one emit() path
// ---------------------------------------------------------------------------
export class Hub {
  private seq = 0;
  state: WorldState = initialState();
  /** This session's events (cleared on session.reset): the access report is built from them. */
  events: EngineEvent[] = [];
  private listeners = new Set<(e: EngineEvent) => void>();
  constructor(public recorder: Recorder | null = null) {}

  emit(ev: Ev): EngineEvent {
    const e = { ...ev, seq: ++this.seq, ts: Date.now() } as EngineEvent;
    this.state = reduce(this.state, e);
    if (e.type === "session.reset") this.events = [];
    this.events.push(e);
    this.recorder?.event(e);
    for (const l of this.listeners) { try { l(e); } catch { /* a bad listener never breaks emit */ } }
    return e;
  }
  on(l: (e: EngineEvent) => void) { this.listeners.add(l); return () => this.listeners.delete(l); }
}

/** What the server talks to: the live Project or the replay driver. */
export interface Driver { boot(): void; command(cmd: GameCommand): void; harness?(): string }

// ---------------------------------------------------------------------------
// Command validation (pure; shared with replay)
// ---------------------------------------------------------------------------
const STOPPABLE: Phase[] = ["planning", "contract", "fencing", "building"];

export function validateCommand(s: WorldState, c: GameCommand): string | null {
  if (!c || typeof c !== "object" || typeof (c as { type?: unknown }).type !== "string") return "malformed command";
  switch (c.type) {
    case "reset": return null;
    case "start":
      if (s.phase !== "idle") return `start needs phase idle (now ${s.phase})`;
      return typeof c.prompt === "string" && c.prompt.trim() ? null : "empty prompt";
    case "prompt":
      if (s.phase !== "ready" && s.phase !== "launched") return `prompt needs phase ready or launched (now ${s.phase})`;
      return typeof c.text === "string" && c.text.trim() ? null : "empty prompt";
    case "approve.plan":
      return s.phase === "contract" ? null : `approve.plan needs phase contract (now ${s.phase})`;
    case "adjust.plan":
      if (s.phase !== "contract") return `adjust.plan needs phase contract (now ${s.phase})`;
      return typeof c.text === "string" && c.text.trim() ? null : "empty adjustment";
    case "escalation.choose": {
      const o = s.openEscalation;
      if (!o) return "no escalation is open";
      if (o.escalationId !== c.escalationId) return `${c.escalationId} is not the open escalation (${o.escalationId})`;
      return o.options.some((x) => x.id === c.optionId) ? null : `unknown option ${c.optionId}`;
    }
    case "fix.apply": {
      if (!["inspecting", "ready", "launched"].includes(s.phase)) return `fix.apply not allowed in phase ${s.phase}`;
      const f = s.findings.find((x) => x.id === c.findingId);
      if (!f) return `no open finding ${c.findingId}`;
      return f.fixes.some((x) => x.id === c.fixId) ? null : `unknown fix ${c.fixId}`;
    }
    case "launch":
      if (s.phase !== "ready") return `launch needs phase ready (now ${s.phase})`;
      return s.launchUnlocked ? null : "launch is locked";
    case "stop":
      return STOPPABLE.includes(s.phase) ? null : `nothing to stop (phase ${s.phase})`;
    default:
      return `unknown command ${(c as { type: string }).type}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
class StaleError extends Error { constructor() { super("stale session"); } }
const isAbort = (e: unknown) => e instanceof Error && (e.name === "AbortError" || e.message === "aborted");
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Rejects with AbortError as soon as the signal fires, even if the crew ignores it. */
export function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { p.catch(() => {}); return Promise.reject(abortError()); }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    p.then((v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
           (e) => { signal.removeEventListener("abort", onAbort); reject(e); });
  });
}
function abortError() { const e = new Error("aborted"); e.name = "AbortError"; return e; }

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------
export class Project implements Driver {
  private gen = 0;                                   // bumped by Reset; stale flows stop emitting
  private sessionCtl = new AbortController();
  private setupCtl: AbortController | null = null;   // turn 1 planning/fencing
  private turnCtl: AbortController | null = null;    // the running turn (Stop aborts it)
  private stopRequested = false;
  private turnId = 0;
  private firstPrompt = "";
  private adjustments: string[] = [];
  private plan: FencePlan | null = null;
  // escalations: one card open at a time; others queue behind it
  private esc: { id: string; resolve: (c: Choice) => void } | null = null;
  private escChain: Promise<unknown> = Promise.resolve();
  private escActive = 0;
  private escIdle: (() => void)[] = [];
  private escSeq = 0;
  private followUps: string[] = [];                  // messages for Claude waiting inside this turn
  // fixes and launch run one at a time, after any running inspection
  private ops: Promise<void> = Promise.resolve();
  private inspection: Promise<void> | null = null;
  private launching = false;
  private fixing = new Set<string>();

  constructor(private hub: Hub, private crew: Crew, private ai: Ask) {}
  get state() { return this.hub.state; }

  boot() { this.resetSession(); }

  /** POST /harness/attack: fire the simulated attack into the current project (labelled simulated). */
  harness(): string {
    if (!this.crew.attack) return "this crew has no attack harness";
    if (this.state.phase === "idle" || this.state.phase === "planning" && this.turnId <= 1 || this.state.phase === "contract") return "no fence yet: start a project and approve its plan first";
    try { return this.crew.attack(this.ctx(this.sessionCtl.signal)); }
    catch (e) { return `harness failed: ${msg(e)}`; }
  }

  command(cmd: GameCommand) {
    const why = validateCommand(this.state, cmd) ?? this.busyReason(cmd);
    if (why) { this.hub.emit({ actor: "system", type: "raw.log", channel: "engine", text: `ignored ${cmd?.type ?? "?"}: ${why}` }); return; }
    this.hub.recorder?.command(cmd);
    switch (cmd.type) {
      case "reset": return this.resetSession();
      case "start": return this.start(cmd.prompt.trim());
      case "adjust.plan": return this.adjust(cmd.text.trim());
      case "approve.plan": return this.approve();
      case "prompt": return this.laterTurn(cmd.text.trim());
      case "escalation.choose": { const e = this.esc; this.esc = null; e?.resolve(cmd.optionId); return; }
      case "fix.apply": return this.fix(cmd.findingId, cmd.fixId);
      case "launch": return this.launch();
      case "stop": return this.stop();
    }
  }

  /** Engine-internal reasons a phase-valid command still can't run right now. */
  private busyReason(c: GameCommand): string | null {
    if (c?.type === "prompt" && (this.launching || this.fixing.size)) return "a fix or launch is still running";
    if (c?.type === "launch" && (this.launching || this.fixing.size)) return this.launching ? "already launching" : "a fix is still running";
    if (c?.type === "fix.apply" && this.fixing.has(c.findingId)) return "that fix is already running";
    if (c?.type === "stop" && this.state.phase === "building" && !this.turnCtl) return "no turn is running";
    return null;
  }

  // --- context handed to the crew --------------------------------------------
  private ctx(signal: AbortSignal): CrewCtx {
    const gen = this.gen;
    const live = () => { if (gen !== this.gen) throw new StaleError(); };
    return {
      emit: (ev) => { live(); this.hub.emit(ev); },
      say: (actor, text) => { live(); this.hub.emit({ actor, type: "speech", text }); },
      log: (channel, text) => { live(); this.hub.emit({ actor: "system", type: "raw.log", channel, text }); },
      escalate: (requested, source) => { live(); return this.escalate(gen, signal, requested, source).then((r) => r.choice); },
      signal,
      ai: this.ai,
      state: () => this.hub.state,
      events: () => this.hub.events,
    };
  }

  /** Runs a background flow. Stale sessions end silently; anything unexpected goes to a safe phase. */
  private bg(flow: Promise<void>) {
    const gen = this.gen;
    flow.catch((e) => {
      if (e instanceof StaleError || gen !== this.gen) return;
      this.hub.emit({ actor: "system", type: "engine.error", message: `Unexpected: ${msg(e)}` });
      this.safePhase();
    });
  }
  private safePhase() {
    if (this.turnId <= 1 && !this.state.segments.some((s) => s.status !== "planned")) { this.resetSession(); return; }
    this.turnCtl = null;
    if (this.state.phase !== "ready") this.hub.emit({ actor: "system", type: "session.phase", phase: "ready" });
  }

  // --- reset --------------------------------------------------------------------
  private resetSession() {
    this.gen++;
    this.sessionCtl.abort(); this.sessionCtl = new AbortController();
    this.setupCtl?.abort(); this.setupCtl = null;
    this.turnCtl?.abort(); this.turnCtl = null;
    this.stopRequested = false;
    this.turnId = 0; this.firstPrompt = ""; this.adjustments = []; this.plan = null;
    this.esc = null; this.escChain = Promise.resolve(); this.escActive = 0; this.escIdle = []; this.escSeq = 0;
    this.followUps = [];
    this.ops = Promise.resolve(); this.inspection = null; this.launching = false; this.fixing.clear();
    this.crew.reset?.();
    this.hub.recorder?.newSession();
    this.hub.emit({ actor: "system", type: "session.reset" });
    this.hub.emit({ actor: "system", type: "session.phase", phase: "idle" });
    this.hub.emit({ actor: "dog", type: "dog.state", state: "sleeping" });
  }

  // --- turn 1 setup: planning -> contract -> fencing ----------------------------
  private start(prompt: string) {
    this.turnId = 1; this.firstPrompt = prompt; this.adjustments = [];
    this.hub.emit({ actor: "system", type: "user.prompt", text: prompt });
    this.hub.emit({ actor: "system", type: "turn.started", turnId: 1, prompt });
    this.planFlow();
  }
  private adjust(text: string) { this.adjustments.push(text); this.planFlow(); }

  private planFlow() {
    this.hub.emit({ actor: "system", type: "session.phase", phase: "planning" });
    const ctl = (this.setupCtl = new AbortController());
    const signal = AbortSignal.any([ctl.signal, this.sessionCtl.signal]);
    const ctx = this.ctx(signal);
    const gen = this.gen;
    this.bg((async () => {
      try {
        const plan = await abortable(this.crew.plan(ctx, this.firstPrompt, this.adjustments), signal);
        this.plan = plan;
        this.setupCtl = null;
        ctx.emit({ actor: "tini", type: "fence.plan.proposed", segments: plan.segments, contract: plan.contract });
        ctx.emit({ actor: "system", type: "session.phase", phase: "contract" });
      } catch (e) { this.setupFailed(e, ctl, gen); }
    })());
  }

  private approve() {
    const plan = this.plan!;
    this.hub.emit({ actor: "system", type: "fence.plan.approved" });
    this.hub.emit({ actor: "system", type: "session.phase", phase: "fencing" });
    const ctl = (this.setupCtl = new AbortController());
    const signal = AbortSignal.any([ctl.signal, this.sessionCtl.signal]);
    const ctx = this.ctx(signal);
    const gen = this.gen;
    this.bg((async () => {
      try { await abortable(this.crew.stage(ctx, plan), signal); }
      catch (e) { this.setupFailed(e, ctl, gen); return; }
      this.setupCtl = null;
      const message = [this.firstPrompt, ...this.adjustments].join("\n\n");
      this.turnCtl = new AbortController(); this.stopRequested = false;
      await this.runTurn(1, async () => message);
    })());
  }

  /** Setup failed or was stopped: back to idle with a clean slate. */
  private setupFailed(e: unknown, ctl: AbortController, gen: number) {
    if (e instanceof StaleError || gen !== this.gen) throw new StaleError();
    const stopped = ctl.signal.aborted && this.stopRequested;
    this.resetSession();
    if (stopped) this.hub.emit({ actor: "system", type: "raw.log", channel: "engine", text: "setup stopped by you; back to idle" });
    else this.hub.emit({ actor: "system", type: "engine.error", message: `Setup failed: ${msg(e)}` });
  }

  // --- later turns ----------------------------------------------------------------
  private laterTurn(text: string) {
    const id = ++this.turnId;
    this.hub.emit({ actor: "system", type: "user.prompt", text });
    this.hub.emit({ actor: "system", type: "turn.started", turnId: id, prompt: text });
    this.hub.emit({ actor: "system", type: "launch.locked", reason: "New work since Tina's last inspection" });
    this.hub.emit({ actor: "system", type: "session.phase", phase: "planning" });
    this.turnCtl = new AbortController(); this.stopRequested = false;
    const gen = this.gen;
    this.bg(this.runTurn(id, async (ctx) => {
      // Per-turn access check: code only. Anything new goes through the escalation pipeline.
      const outside = await this.crew.access(ctx, text);
      if (!outside.length) { ctx.say("tini", "Nothing new needed. Same fence."); return text; }
      const notes: string[] = [];
      for (const p of outside) {
        if (ctx.signal.aborted) break;
        ctx.say("tini", `You mentioned ${p}. That's outside the fence, let me check it.`);
        const r = await this.escalate(gen, ctx.signal, p, "prompt");
        if (r.note) notes.push(r.note);
      }
      return notes.length ? `${text}\n\n${notes.join("\n")}` : text;
    }));
  }

  /**
   * One turn, the same for turn 1 and every later turn; only `prepare` differs.
   * A turn is finished only when Claude has sent its result, no escalation is open,
   * and no follow-up message is waiting. Stop ends it as "Stopped by you"; Tina
   * still inspects whatever was written.
   */
  private async runTurn(id: number, prepare: (ctx: CrewCtx) => Promise<string>) {
    const ctl = this.turnCtl!;
    const signal = AbortSignal.any([ctl.signal, this.sessionCtl.signal]);
    const ctx = this.ctx(signal);
    const gen = this.gen;
    let summary = "";
    try {
      const message = await abortable(prepare(ctx), signal);
      ctx.emit({ actor: "system", type: "session.phase", phase: "building" });
      ctx.emit({ actor: "dog", type: "dog.state", state: "working" });
      summary = await abortable(this.crew.runTurn(ctx, message, { turnId: id, followUp: false }), signal);
      for (;;) {
        if (this.escActive > 0) {
          ctx.emit({ actor: "dog", type: "dog.state", state: "waiting" });
          await abortable(new Promise<void>((r) => this.escIdle.push(r)), signal);
        }
        const next = this.followUps.shift();
        if (next === undefined) break;
        ctx.emit({ actor: "dog", type: "dog.state", state: "working" });
        summary = await abortable(this.crew.runTurn(ctx, next, { turnId: id, followUp: true }), signal);
      }
    } catch (e) {
      if (e instanceof StaleError || gen !== this.gen) throw new StaleError();
      if (ctl.signal.aborted && this.stopRequested) summary = "Stopped by you";
      else {
        this.hub.emit({ actor: "system", type: "engine.error", message: `Turn ${id} failed: ${msg(e)}` });
        summary = "Stopped: something went wrong";
      }
    }
    this.turnCtl = null; this.followUps = [];
    const after = this.ctx(this.sessionCtl.signal);
    after.emit({ actor: "dog", type: "dog.state", state: "done" });
    after.emit({ actor: "dog", type: "turn.finished", turnId: id, summary });
    await this.inspectAll(after);
  }

  private stop() {
    this.stopRequested = true;
    const setupPhase = this.turnId <= 1 && ["planning", "contract", "fencing"].includes(this.state.phase);
    if (setupPhase) {
      if (this.setupCtl) { this.setupCtl.abort(); return; }       // planFlow/approve land in setupFailed()
      this.resetSession();                                         // contract card open, nothing running
      this.hub.emit({ actor: "system", type: "raw.log", channel: "engine", text: "setup stopped by you; back to idle" });
      return;
    }
    this.hub.emit({ actor: "tini", type: "speech", text: "Stopping. Tina will still check what was written." });
    this.turnCtl?.abort();
  }

  // --- escalations ------------------------------------------------------------------
  private escalate(gen: number, signal: AbortSignal, requested: string, source: EscalationSource): Promise<{ choice: Choice; note?: string }> {
    this.escActive++;
    const run = this.escChain.then(async () => {
      try {
        if (gen !== this.gen) throw new StaleError();
        if (signal.aborted) return { choice: "deny" as Choice };
        const ctx = this.ctx(signal);
        ctx.emit({ actor: "tina", type: "tina.inspect.started", scope: "folder" });
        const card = await abortable(this.crew.inspectRequest(ctx, requested, source), signal);
        ctx.emit({ actor: "tina", type: "tina.inspect.finished", scope: "folder", redCount: card.inspection.highlights.filter((h) => h.severity === "high").length });
        const esc: OpenEscalation = { escalationId: `esc-${++this.escSeq}`, requested, source, card };
        ctx.emit({ actor: "tini", type: "escalation.opened", escalationId: esc.escalationId, source, requested, ask: card.ask, inspection: card.inspection, options: card.options });
        const choice = await new Promise<Choice>((resolve) => {
          this.esc = { id: esc.escalationId, resolve };
          signal.addEventListener("abort", () => resolve("deny"), { once: true }); // Stop closes the card as a deny
        });
        if (this.esc?.id === esc.escalationId) this.esc = null;
        if (gen !== this.gen) throw new StaleError();
        const stopped = signal.aborted;
        const label = card.options.find((o) => o.id === choice)?.label ?? choice;
        ctx.emit({ actor: "system", type: "escalation.resolved", escalationId: esc.escalationId, choice,
          summary: stopped ? "Turn stopped, nothing added" : choice === "deny" ? "Request denied" : label });
        if (stopped) return { choice };
        const { note } = await abortable(this.crew.applyEscalation(ctx, esc, choice), signal);
        // Claude asked while working: approved files reach it as a follow-up message in the same turn.
        if (source === "agent" && choice !== "deny" && note) this.followUps.push(note);
        return { choice, note };
      } finally {
        if (gen === this.gen && --this.escActive === 0) { const w = this.escIdle; this.escIdle = []; w.forEach((r) => r()); }
      }
    });
    this.escChain = run.catch(() => {});
    return run;
  }

  // --- Tina's per-turn inspection ------------------------------------------------------
  private async inspectAll(ctx: CrewCtx) {
    const gen = this.gen;
    const flow = (async () => {
      ctx.emit({ actor: "system", type: "session.phase", phase: "inspecting" });
      ctx.emit({ actor: "tina", type: "tina.inspect.started", scope: "final" });
      let ok = true;
      try {
        const segs = this.state.segments;
        const found = await abortable(this.crew.inspect(ctx, segs), this.sessionCtl.signal);
        for (const f of found) ctx.emit({ actor: "tina", type: "segment.red", segmentId: f.segmentId, finding: f });
        const red = new Set(this.state.findings.map((f) => f.segmentId)); // includes earlier unfixed findings
        for (const s of segs) if (!red.has(s.id)) ctx.emit({ actor: "tina", type: "segment.green", segmentId: s.id });
        ctx.emit({ actor: "tina", type: "tina.inspect.finished", scope: "final", redCount: red.size });
        ctx.say("tina", red.size ? `${red.size === 1 ? "One red spot" : `${red.size} red spots`}. I can't launch like this.` : "All green. Now you can launch.");
      } catch (e) {
        if (e instanceof StaleError || gen !== this.gen) throw new StaleError();
        ok = false;
        ctx.emit({ actor: "system", type: "engine.error", message: `Inspection failed: ${msg(e)}. Launch stays locked.` });
      }
      ctx.emit({ actor: "system", type: "session.phase", phase: "ready" });
      if (ok) this.maybeUnlock(ctx);
    })();
    this.inspection = flow.catch(() => {});
    try { await flow; } finally { this.inspection = null; }
  }

  /** Launch unlocks only when every segment is green and nothing is unresolved. */
  private maybeUnlock(ctx: CrewCtx) {
    const s = this.state;
    if (s.phase === "ready" && !s.launchUnlocked && s.findings.length === 0 && s.segments.every((g) => g.status === "green")) {
      ctx.emit({ actor: "system", type: "launch.unlocked" });
      return true;
    }
    return false;
  }

  // --- fixes and launch ---------------------------------------------------------------
  private fix(findingId: string, fixId: string) {
    this.fixing.add(findingId);
    const gen = this.gen;
    this.ops = this.ops.then(async () => {
      if (this.inspection) await this.inspection;
      if (gen !== this.gen) return;
      const ctx = this.ctx(this.sessionCtl.signal);
      try {
        const f: Finding | undefined = this.state.findings.find((x) => x.id === findingId);
        if (!f) return;
        const summary = await abortable(this.crew.fix(ctx, f, fixId), this.sessionCtl.signal);
        ctx.emit({ actor: "tina", type: "fix.applied", findingId, fixId, summary });
        if (!this.state.findings.some((x) => x.segmentId === f.segmentId)) ctx.emit({ actor: "tina", type: "segment.green", segmentId: f.segmentId });
        if (this.maybeUnlock(ctx)) ctx.say("tina", "All green. Now you can launch.");
      } catch (e) {
        if (e instanceof StaleError || gen !== this.gen) return;
        this.hub.emit({ actor: "system", type: "engine.error", message: `Fix failed: ${msg(e)}` });
      } finally {
        if (gen === this.gen) this.fixing.delete(findingId);
      }
    });
  }

  private launch() {
    this.launching = true;
    const gen = this.gen;
    this.ops = this.ops.then(async () => {
      const ctx = this.ctx(this.sessionCtl.signal);
      try {
        const { url, report } = await abortable(this.crew.launch(ctx), this.sessionCtl.signal);
        ctx.emit({ actor: "system", type: "launch.done", url });
        ctx.emit({ actor: "system", type: "session.phase", phase: "launched" });
        ctx.emit({ actor: "system", type: "report.ready", report });
      } catch (e) {
        if (e instanceof StaleError || gen !== this.gen) return;
        this.hub.emit({ actor: "system", type: "engine.error", message: `Launch failed: ${msg(e)}` });
      } finally {
        if (gen === this.gen) this.launching = false;
      }
    });
  }
}
