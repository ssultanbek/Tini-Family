// Replay mode: plays a recording through the engine's own server and emit(), using
// mock/player.ts. It pauses at every recorded click and prompt, and sends
// prompt.suggested before each prompt so the presenter just presses Send.
// Commands are checked against the replayed phase exactly like live mode, so a stray
// click can't be buffered and consumed at the wrong gate.
import type { GameCommand } from "../../shared/events.ts";
import { Player } from "../../mock/player.ts";
import type { Ev } from "./crew.ts";
import fs from "node:fs";
import path from "node:path";
import { expandHome } from "./guard.ts";
import { serveSite, stopSite, SITE_PORT } from "./launcher.ts";
import { validateCommand, type Driver, type Hub } from "./project.ts";

export class ReplayDriver implements Driver {
  private player: Player;
  private workspace: string | null = null;   // the recorded run's workspace, from its config log line
  constructor(private hub: Hub, private file: string, speed = 1) {
    this.player = new Player({
      emit: (e) => {
        // Ignored-command lines belong to the live run's clicks, not this one's.
        if (e.type === "raw.log" && e.channel === "engine") return;
        if (e.type === "session.reset") { this.workspace = null; void stopSite(); }
        if (e.type === "raw.log" && e.channel === "config") {
          const m = e.text.match(/^workspace (\S+);/);
          if (m) this.workspace = path.resolve(expandHome(m[1]));
        }
        const { seq: _s, ts: _t, ...rest } = e;
        if (e.type === "launch.done") { this.launch(); return; }
        hub.emit(rest as Ev);
      },
    }, speed, "replay");
  }

  /** Launch in a replay serves the recorded site if its folder is still on this machine, like live mode. */
  private launch() {
    const ws = this.workspace;
    if (ws && fs.existsSync(path.join(ws, "index.html"))) {
      const url = `http://localhost:${SITE_PORT}`;
      this.hub.emit({ actor: "system", type: "launch.done", url });
      serveSite(ws).then(
        () => this.hub.emit({ actor: "system", type: "raw.log", channel: "config", text: `replay launch: serving ${ws} at ${url}` }),
        (err) => this.hub.emit({ actor: "system", type: "raw.log", channel: "engine", text: `replay launch: couldn't serve ${ws}: ${(err as Error).message}` }));
      return;
    }
    this.hub.emit({ actor: "system", type: "launch.done", note: `This is a replay, and the recorded site's folder${ws ? ` (${ws})` : ""} isn't on this machine, so there's nothing to open.` });
  }

  boot() { void this.player.playRecording(this.file); }

  command(cmd: GameCommand) {
    const why = validateCommand(this.hub.state, cmd);
    if (why) { this.hub.emit({ actor: "system", type: "raw.log", channel: "engine", text: `ignored ${cmd?.type ?? "?"}: ${why}` }); return; }
    if (cmd.type === "reset") { this.player.stop(); this.boot(); return; } // the recording starts with session.reset
    this.player.command(cmd);
  }
}
