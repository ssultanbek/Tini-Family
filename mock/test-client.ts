// Auto-clicks through the whole flow and checks the final world state.
// Also doubles as the reference for how the game talks to the engine.
import { io } from "socket.io-client";
import { ENGINE_PORT, SOCKET, type EngineEvent, type GameCommand, type WorldState } from "../shared/events.ts";
import { reduce } from "../shared/reducer.ts";
import { SUGGESTED } from "./scenario.ts";

const choice = (process.argv[2] ?? "narrow") as "narrow" | "all" | "deny";
const sock = io(`http://localhost:${process.env.PORT ?? ENGINE_PORT}`);
let state: WorldState | null = null;
let lastSeq = 0;
let suggested = 0; // v1.2: prompt.suggested before each prompt gate
const send = (c: GameCommand) => sock.emit(SOCKET.command, c);

sock.on(SOCKET.snapshot, (s: WorldState) => { state = s; lastSeq = s.seq; send({ type: "reset" }); });
sock.on(SOCKET.event, (e: EngineEvent) => {
  if (e.seq <= lastSeq && e.type !== "session.reset") return;
  if (e.seq !== lastSeq + 1 && e.type !== "session.reset") console.log(`!! gap: got #${e.seq} after #${lastSeq}`);
  lastSeq = e.seq; state = reduce(state!, e);
  if (e.type === "prompt.suggested") suggested++;
  if (e.type === "session.phase" && e.phase === "idle") send({ type: "start", prompt: SUGGESTED[1] });
  if (e.type === "session.phase" && e.phase === "contract") send({ type: "approve.plan" });
  if (e.type === "escalation.opened") send({ type: "escalation.choose", escalationId: e.escalationId, optionId: choice });
  if (e.type === "tina.inspect.finished" && e.scope === "final") for (const f of state!.findings) send({ type: "fix.apply", findingId: f.id, fixId: f.fixes[0].id });
  if (e.type === "launch.unlocked" && state!.turns.length === 1) send({ type: "launch" });
  // Turn 2 names a new folder (escalation from the prompt); turn 3 needs nothing new.
  if (e.type === "report.ready") send({ type: "prompt", text: SUGGESTED[2] });
  if (e.type === "launch.unlocked" && state!.turns.length === 2) send({ type: "prompt", text: SUGGESTED[3] });
  if (e.type === "launch.unlocked" && state!.turns.length === 3) {
    const s = state!;
    const ok = s.segments.every((g) => g.status === "green") && s.launchUnlocked && s.findings.length === 0
      && s.phase === "ready" && s.turns.length === 3 && s.turns.every((t) => t.summary) && s.bricks === 16 && suggested === 3 && s.suggestedPrompt === null;
    console.log(`segments: ${s.segments.map((g) => g.id + "=" + g.status).join(", ")}`);
    console.log(`turns=${s.turns.map((t) => t.id).join(",")} blocked=${s.blocked.length} bricks=${s.bricks} suggested=${suggested} choice=${choice} -> ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
});
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 60000);
