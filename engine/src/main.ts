// npm run engine -- --mode standin|replay|live [--demo] [--recording f] [--speed n] [--port n] [--turn-budget usd] [--session-budget usd]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_PORT } from "../../shared/events.ts";
import { createAiFromEnv } from "./ai.ts";
import { Hub, Project, type Driver } from "./project.ts";
import { Recorder } from "./recorder.ts";
import { ReplayDriver } from "./replay.ts";
import { startServer } from "./server.ts";
import { standinCrew } from "./standins.ts";
import { liveCrew } from "./live.ts";
import { exiftool } from "exiftool-vendored";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, "..");
try { process.loadEnvFile(path.join(engineDir, ".env")); } catch { /* no .env: the AI ladder falls back */ }

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const mode = arg("mode") ?? "standin";
const speed = Number(arg("speed") ?? 1);
const port = Number(arg("port") ?? ENGINE_PORT);
const demo = process.argv.includes("--demo"); // live: fire the simulated attack once in turn 1, after the 4th brick

if (mode !== "standin" && mode !== "replay" && mode !== "live") {
  console.error(`unknown --mode ${mode} (standin | replay | live)`);
  process.exit(1);
}

const recorder = mode === "replay" ? null : new Recorder(path.join(engineDir, "recordings"), mode);
const hub = new Hub(recorder);
let driver: Driver;
if (mode === "replay") {
  const recording = arg("recording");
  if (!recording) { console.error("--mode replay needs --recording <file>"); process.exit(1); }
  driver = new ReplayDriver(hub, path.resolve(recording), speed);
} else {
  const ai = createAiFromEnv((line) => hub.emit({ actor: "system", type: "raw.log", channel: "ai", text: line }));
  let crew = standinCrew(speed);
  if (mode === "live") {
    if (!process.env.ANTHROPIC_API_KEY) { console.error("live mode needs ANTHROPIC_API_KEY in engine/.env"); process.exit(1); }
    crew = liveCrew({ speed: 1, demo, turnBudgetUsd: Number(arg("turn-budget") ?? 2), sessionBudgetUsd: Number(arg("session-budget") ?? 6) });
  }
  driver = new Project(hub, crew, ai);
}

hub.on((e) => {
  if (e.type === "raw.log") { if (e.channel === "engine") console.log(`   ${e.text}`); return; }
  console.log(`  #${e.seq} ${e.type}${"phase" in e ? " " + e.phase : ""}${"turnId" in e ? " t" + e.turnId : ""}`);
});

startServer({ hub, driver, mode, port, gameDist: path.resolve(engineDir, "../game/dist") })
  .then(() => {
    console.log(`Tini engine on http://127.0.0.1:${port}  mode=${mode} speed=${speed}x${recorder ? "  recording to engine/recordings/" : ""}`);
    driver.boot();
  })
  .catch((e) => { console.error(`could not listen on 127.0.0.1:${port}: ${(e as Error).message}`); process.exit(1); });

// Shutdown: stop exiftool's background process (Stage 3/5 use the shared instance).
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => { void exiftool.end().catch(() => {}).finally(() => process.exit(0)); });
}
