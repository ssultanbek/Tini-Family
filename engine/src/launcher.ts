// Launch = "the results are cleared to leave the yard" (decision 14).
// Website: serve the workspace statically on 127.0.0.1:5050 (one site at a time).
// Anything else: open the workspace folder in Finder.
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";

export const SITE_PORT = 5050;
let server: http.Server | null = null;

/** True if the workspace looks like a website (an index.html at its root). */
export function isWebsite(workspace: string): boolean {
  return fs.existsSync(path.join(workspace, "index.html"));
}

export async function serveSite(workspace: string, port = SITE_PORT): Promise<string> {
  await stopSite();
  const app = express();
  app.use(express.static(workspace, { dotfiles: "ignore", index: "index.html" }));   // .claude/ and dotfiles never served
  server = await new Promise<http.Server>((resolve, reject) => {
    const s = http.createServer(app);
    s.once("error", reject);
    s.listen(port, "127.0.0.1", () => resolve(s));
  });
  return `http://localhost:${port}`;
}

export function stopSite(): Promise<void> {
  const s = server; server = null;
  return new Promise((resolve) => (s ? s.close(() => resolve()) : resolve()));
}

export function openInFinder(dir: string): Promise<void> {
  return new Promise((resolve) => execFile("open", [dir], () => resolve()));
}
