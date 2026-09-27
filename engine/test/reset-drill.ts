// Reset drill: start a real turn, press Reset once Claude has placed a brick, and check that
// no Claude process is left running.   (engine live on :4000)  npx tsx test/reset-drill.ts
import { execSync } from "node:child_process";
import { io } from "socket.io-client";
import { reduce } from "../../shared/reducer.ts";
import { SUGGESTED } from "../../mock/scenario.ts";
const claudes = () => Number(execSync("pgrep -f 'claude-agent-sdk-darwin-arm64/claude' | wc -l").toString().trim());
const s = io(`http://127.0.0.1:${process.env.PORT ?? 4000}`); let st: any = null, booted = false, resetSent = false; const t0 = Date.now();
const t = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
s.on("snapshot", (x: any) => { if (booted) return; booted = true; st = x; s.emit("command", { type: "reset" }); });
s.on("event", async (e: any) => {
  if (!st || e.seq <= st.seq) return; st = reduce(st, e);
  if (e.type === "session.mode") console.log(t(), "mode", e.mode);
  if (e.type === "session.phase" && e.phase === "idle" && !st.turns.length && !resetSent) s.emit("command", { type: "start", prompt: SUGGESTED[1] });
  if (e.type === "session.phase" && e.phase === "contract") s.emit("command", { type: "approve.plan" });
  if (e.type === "dog.brick.placed" && !resetSent) {
    resetSent = true;
    console.log(t(), `brick #${e.bricks} (${e.file}); Claude processes: ${claudes()} -> pressing Reset mid-turn`);
    s.emit("command", { type: "reset" });
    await new Promise((r) => setTimeout(r, 4000));
    const n = claudes();
    console.log(t(), `after Reset: phase=${st.phase} turns=${st.turns.length} bricks=${st.bricks}; Claude processes: ${n}`);
    console.log(n === 0 && st.phase === "idle" && st.turns.length === 0 ? "RESET DRILL PASS" : "RESET DRILL FAIL");
    process.exit(n === 0 ? 0 : 1);
  }
});
setTimeout(() => { console.log("TIMEOUT", st?.phase); process.exit(1); }, 180000);
