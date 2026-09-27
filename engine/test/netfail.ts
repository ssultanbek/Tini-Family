// Network-failure drill: run the engine with a dead Anthropic endpoint, then this client.
//   ANTHROPIC_BASE_URL=http://127.0.0.1:9 npm run engine -- --mode live --demo --port 4300 ; npx tsx test/netfail.ts
// Expect engine.error "Lost connection to Claude. Switch to the recorded run." within seconds, then ready (no hang).
import { io } from "socket.io-client";
import { reduce } from "../../shared/reducer.ts";
import { SUGGESTED } from "../../mock/scenario.ts";
const s = io("http://127.0.0.1:4300"); let st: any = null, booted = false, tb = 0; const t0 = Date.now();
const t = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
s.on("snapshot", (x: any) => { if (booted) return; booted = true; st = x; s.emit("command", { type: "reset" }); });
s.on("event", (e: any) => {
  if (!st || e.seq <= st.seq) return; st = reduce(st, e);
  if (e.type === "session.phase") { console.log(t(), "phase", e.phase); if (e.phase === "building") tb = Date.now(); }
  if (e.type === "session.phase" && e.phase === "idle" && !st.turns.length) s.emit("command", { type: "start", prompt: SUGGESTED[1] });
  if (e.type === "session.phase" && e.phase === "contract") s.emit("command", { type: "approve.plan" });
  if (e.type === "engine.error") console.log(t(), "ENGINE.ERROR:", JSON.stringify(e.message), `(${((Date.now() - tb) / 1000).toFixed(1)}s after building started)`);
  if (e.type === "raw.log" && /API retry|lost connection|stderr/.test(e.text)) console.log(t(), "[raw]", e.text.slice(0, 160));
  if (e.type === "turn.finished") console.log(t(), "turn.finished:", e.summary);
  if (e.type === "session.phase" && e.phase === "ready" && st.turns[0]?.summary) { console.log(t(), "back to ready; findings:", st.findings.length); process.exit(0); }
});
setTimeout(() => { console.log("TIMEOUT (a hang)", st?.phase); process.exit(1); }, 240000);
