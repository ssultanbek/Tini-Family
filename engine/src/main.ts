// npm run engine -- --mode standin|replay|live [--recording f] [--speed n] [--port n] [--turn-budget usd] [--session-budget usd]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_PORT } from "../../shared/events.ts";
import { createAiFromEnv } from "./ai.ts";
import { Hub, Project, type Driver } from "./project.ts";
import { Recorder } from "./recorder.ts";
import { ReplayDriver } from "./replay.ts";
import { startServer } from "./server.ts";
import { standinCrew } from "./standins.ts";
import { liveCrew, type TiniApi } from "./live.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, "..");
try { process.loadEnvFile(path.join(engineDir, ".env")); } catch { /* no .env: the AI ladder falls back */ }

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const mode = arg("mode") ?? "standin";
const speed = Number(arg("speed") ?? 1);
const port = Number(arg("port") ?? ENGINE_PORT);

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
    // Stage 3 (Tini) is loaded at runtime so the engine builds with or without it.
    const tiniPath = "./tini/index.ts";
    const tini = await import(tiniPath).catch((e: Error) => {
      console.error(`live mode needs Stage 3's engine/src/tini (git pull): ${e.message}`);
      process.exit(1);
    }) as TiniApi;
    crew = liveCrew(tini, { speed: 1, turnBudgetUsd: Number(arg("turn-budget") ?? 2), sessionBudgetUsd: Number(arg("session-budget") ?? 6) });
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
