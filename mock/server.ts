// FAKE ENGINE. Same port and protocol as the real engine.
//   npm run mock                         scripted Rivera story at 1x
//   npm run mock -- --speed 3            faster
//   npm run mock -- --recording recordings/run-01.jsonl   replay a real engine run
import fs from "node:fs";
import http from "node:http";
import express from "express";
import { Server } from "socket.io";
import { ENGINE_PORT, SOCKET, PROTOCOL_VERSION, type EngineEvent, type GameCommand } from "../shared/events.ts";
import { initialState, reduce } from "../shared/reducer.ts";
import { riveraScenario } from "./scenario.ts";
import { Player } from "./player.ts";

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const speed = Number(arg("speed") ?? 1);
const recording = arg("recording");
const port = Number(arg("port") ?? ENGINE_PORT);
const recordTo = arg("record"); // write this session as a replayable JSONL recording
const rec = (line: object) => { if (recordTo) fs.appendFileSync(recordTo, JSON.stringify(line) + "\n"); };
if (recordTo) fs.writeFileSync(recordTo, "");

const app = express();
app.get("/health", (_req, res) => res.json({ ok: true, engine: "mock", protocol: PROTOCOL_VERSION }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let state = initialState();
const player = new Player({ emit(e: EngineEvent) {
  state = reduce(state, e);
  rec({ kind: "event", event: e });
  io.emit(SOCKET.event, e);
  const tag = e.type === "raw.log" ? "" : `  #${e.seq} ${e.type}${"segmentId" in e ? " " + (e as any).segmentId : ""}`;
  if (tag) console.log(tag);
} }, speed);

const restart = () => (recording ? player.playRecording(recording) : player.playScript(riveraScenario()));

io.on("connection", (sock) => {
  sock.emit(SOCKET.snapshot, state);
  sock.on(SOCKET.command, (cmd: GameCommand) => {
    console.log(`<- command ${cmd.type}${player.waitingFor() ? ` (waiting for ${player.waitingFor()})` : ""}`);
    if (cmd.type !== "reset") rec({ kind: "command", command: cmd });
    if (cmd.type === "reset") { player.stop(); state = initialState(); restart(); return; }
    if (player.command(cmd) === "buffered") console.log(`   (buffered: engine will use it when it reaches ${cmd.type})`);
  });
});

server.listen(port, () => {
  console.log(`Fake engine on http://localhost:${port}  speed=${speed}x  ${recording ? "recording=" + recording : "script=rivera"}`);
  restart();
});
