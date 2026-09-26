// Plays a scripted scenario or a recorded JSONL session over Socket.IO.
// Gates pause until the game sends the matching command. Speed scales waits.
import fs from "node:fs";
import type { EngineEvent, GameCommand } from "../shared/events.ts";
import type { Step, Ev } from "./scenario.ts";

export interface Emitter { emit(e: EngineEvent): void }

export class Player {
  private seq = 0;
  private pending: { type: GameCommand["type"]; resolve: (c: GameCommand) => void } | null = null;
  private runId = 0;
  constructor(private out: Emitter, public speed = 1) {}

  // Clicks can arrive before the script reaches its gate (e.g. the judge picks an
  // escalation option while the dog is still building). Buffer them briefly.
  private early: { cmd: GameCommand; at: number }[] = [];

  command(cmd: GameCommand): "consumed" | "buffered" {
    if (this.pending && this.pending.type === cmd.type) { const p = this.pending; this.pending = null; p.resolve(cmd); return "consumed"; }
    this.early.push({ cmd, at: Date.now() });
    return "buffered";
  }
  waitingFor() { return this.pending?.type ?? null; }

  private sleep(ms: number, run: number) {
    return new Promise<void>((r) => setTimeout(r, ms / this.speed)).then(() => { if (run !== this.runId) throw new Error("stopped"); });
  }
  private gate(type: GameCommand["type"], run: number) {
    this.early = this.early.filter((b) => Date.now() - b.at < 15000);
    const i = this.early.findIndex((b) => b.cmd.type === type);
    if (i >= 0) { const [b] = this.early.splice(i, 1); return Promise.resolve(b.cmd); }
    return new Promise<GameCommand>((resolve) => (this.pending = { type, resolve })).then((c) => { if (run !== this.runId) throw new Error("stopped"); return c; });
  }
  private send(ev: Ev) { this.out.emit({ ...ev, seq: ++this.seq, ts: Date.now() } as EngineEvent); }

  async playScript(steps: Step[]) {
    const run = ++this.runId; this.pending = null; this.early = [];
    try {
      const queue = [...steps];
      while (queue.length) {
        const st = queue.shift()!;
        if ("lazy" in st) { queue.unshift(...st.lazy()); continue; }
        if ("gate" in st) { const cmd = await this.gate(st.gate, run); if (st.then) queue.unshift(...st.then(cmd)); }
        else { await this.sleep(st.wait, run); this.send(st.ev); }
      }
    } catch (e) { if ((e as Error).message !== "stopped") throw e; }
  }

  /** JSONL lines: {"kind":"event","event":{...}} or {"kind":"command","command":{...}} */
  async playRecording(file: string) {
    const run = ++this.runId; this.pending = null; this.early = [];
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    let lastTs: number | null = null;
    try {
      for (const line of lines) {
        if (line.kind === "command") { await this.gate(line.command.type, run); continue; }
        const ev = line.event as EngineEvent;
        const gap = lastTs === null ? 0 : Math.min(ev.ts - lastTs, 4000); // cap dead air at 4s
        lastTs = ev.ts;
        await this.sleep(Math.max(0, gap), run);
        const { seq, ts, ...rest } = ev;
        this.send(rest as Ev);
      }
    } catch (e) { if ((e as Error).message !== "stopped") throw e; }
  }
  stop() { this.runId++; this.pending = null; this.early = []; }
}
