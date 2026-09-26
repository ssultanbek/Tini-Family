// Writes every event and accepted command to engine/recordings/<timestamp>-<mode>.jsonl,
// in the mock's format ({"kind":"event",...} / {"kind":"command",...}), so mock/player.ts
// can replay it. A Reset starts a new file; the reset itself is never recorded. A file is
// only created once the session has its first command, so idle restarts leave no clutter.
import fs from "node:fs";
import path from "node:path";
import type { EngineEvent, GameCommand } from "../../shared/events.ts";

export class Recorder {
  private file: string | null = null;
  private buffer: string[] = [];
  constructor(private dir: string, private mode: string, private enabled = true) {}

  newSession() { this.file = null; this.buffer = []; }
  current() { return this.file; }

  event(e: EngineEvent) { this.write({ kind: "event", event: e }, false); }
  command(c: GameCommand) { if (c.type !== "reset") this.write({ kind: "command", command: c }, true); }

  private write(line: object, isCommand: boolean) {
    if (!this.enabled) return;
    const text = JSON.stringify(line) + "\n";
    if (!this.file) {
      this.buffer.push(text);
      if (!isCommand) return;
      fs.mkdirSync(this.dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
      this.file = path.join(this.dir, `${stamp}-${this.mode}.jsonl`);
      fs.writeFileSync(this.file, this.buffer.join(""));
      this.buffer = [];
      return;
    }
    fs.appendFileSync(this.file, text);
  }
}
