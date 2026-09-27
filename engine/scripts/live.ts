// npm run live: the table demo in one command.
//   1. refuses to start if something already answers on :4000
//   2. builds game/ if dist is missing or older than game/src or shared/
//   3. starts the engine: --mode live --demo on 127.0.0.1:4000, serving the built game
//   4. opens Chrome in app mode at http://localhost:4000
// Between judges, the game's Reset is enough: originals are never modified and every
// project gets a fresh workspace. Ctrl-C stops the engine (and Claude with it).
import { execFile, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(engineDir, "..");
const game = path.join(root, "game");
const URL = "http://localhost:4000";

const newest = (dir: string): number => {
  let t = 0;
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else t = Math.max(t, fs.statSync(p).mtimeMs);
  } };
  if (fs.existsSync(dir)) walk(dir);
  return t;
};

async function health(): Promise<{ engine?: string } | null> {
  try { const r = await fetch("http://127.0.0.1:4000/health", { signal: AbortSignal.timeout(800) }); return r.ok ? await r.json() : null; } catch { return null; }
}

const busy = await health();
if (busy) { console.error(`Something is already running on :4000 (engine: ${busy.engine ?? "?"}). Stop it first (or use the game already open).`); process.exit(1); }

const built = path.join(game, "dist", "index.html");
const stale = !fs.existsSync(built) || Math.max(newest(path.join(game, "src")), newest(path.join(root, "shared")), fs.statSync(path.join(game, "index.html")).mtimeMs) > fs.statSync(built).mtimeMs;
if (stale) {
  console.log("Building the game...");
  if (!fs.existsSync(path.join(game, "node_modules"))) execFileSync("npm", ["install"], { cwd: game, stdio: "inherit" });
  execFileSync("npm", ["run", "build"], { cwd: game, stdio: "inherit" });
} else console.log("Game build is up to date.");

console.log("Starting the engine (live, --demo) on http://localhost:4000 ...");
const engine = spawn("npx", ["tsx", "src/main.ts", "--mode", "live", "--demo"], { cwd: engineDir, stdio: "inherit" });
const stop = (sig: NodeJS.Signals) => { if (!engine.killed) engine.kill(sig); };
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
engine.on("exit", (code) => process.exit(code ?? 0));

for (let i = 0; i < 60 && !(await health()); i++) await new Promise((r) => setTimeout(r, 500));
if (!(await health())) { console.error("The engine didn't come up on :4000. See the output above."); stop("SIGTERM"); process.exit(1); }
if (process.env.TINI_NO_OPEN) console.log(`Engine up at ${URL} (TINI_NO_OPEN set: not opening Chrome).`);
else execFile("open", ["-na", "Google Chrome", "--args", `--app=${URL}`], (err) => {
  if (err) console.log(`Couldn't open Chrome (${err.message}). Open ${URL} in any browser.`);
  else console.log(`Opened ${URL} in Chrome app mode. Ctrl-C here stops the engine.`);
});
