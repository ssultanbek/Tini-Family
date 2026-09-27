// Replay mode: plays a recording through the engine's own server and emit(), using
// mock/player.ts. It pauses at every recorded click and prompt, and sends
// prompt.suggested before each prompt so the presenter just presses Send.
// Commands are checked against the replayed phase exactly like live mode, so a stray
// click can't be buffered and consumed at the wrong gate.
import type { GameCommand } from "../../shared/events.ts";
import { Player } from "../../mock/player.ts";
import type { Ev } from "./crew.ts";
import { validateCommand, type Driver, type Hub } from "./project.ts";

export class ReplayDriver implements Driver {
  private player: Player;
  constructor(private hub: Hub, private file: string, speed = 1) {
    this.player = new Player({
      emit: (e) => {
        // Ignored-command lines belong to the live run's clicks, not this one's.
        if (e.type === "raw.log" && e.channel === "engine") return;
        const { seq: _s, ts: _t, ...rest } = e;
        hub.emit(rest as Ev);
      },
    }, speed, "replay");
  }

  boot() { void this.player.playRecording(this.file); }

  command(cmd: GameCommand) {
    const why = validateCommand(this.hub.state, cmd);
    if (why) { this.hub.emit({ actor: "system", type: "raw.log", channel: "engine", text: `ignored ${cmd?.type ?? "?"}: ${why}` }); return; }
    if (cmd.type === "reset") { this.player.stop(); this.boot(); return; } // the recording starts with session.reset
    this.player.command(cmd);
  }
}
