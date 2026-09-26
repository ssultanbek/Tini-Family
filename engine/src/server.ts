// Express + Socket.IO on 127.0.0.1 only. Snapshot on connect, commands to the driver
// (live project or replay), every event broadcast. Serves ../game/dist when it exists.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import { Server } from "socket.io";
import { ENGINE_PORT, PROTOCOL_VERSION, SOCKET, type GameCommand } from "../../shared/events.ts";
import type { Driver, Hub } from "./project.ts";

export interface ServerOptions { hub: Hub; driver: Driver; mode: string; port?: number; gameDist?: string }

export function startServer({ hub, driver, mode, port = ENGINE_PORT, gameDist }: ServerOptions): Promise<http.Server> {
  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true, engine: mode, protocol: PROTOCOL_VERSION, seq: hub.state.seq, phase: hub.state.phase }));
  if (gameDist && fs.existsSync(path.join(gameDist, "index.html"))) app.use(express.static(gameDist));

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: ["http://localhost:5173", "http://127.0.0.1:5173"] } });
  hub.on((e) => io.emit(SOCKET.event, e));
  io.on("connection", (sock) => {
    sock.emit(SOCKET.snapshot, hub.state);
    sock.on(SOCKET.command, (cmd: GameCommand) => {
      try { driver.command(cmd); }
      catch (e) { hub.emit({ actor: "system", type: "engine.error", message: `Command failed: ${(e as Error).message}` }); }
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
