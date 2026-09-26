// Prints a deterministic manifest of the demo world: for every file, a sha256 of its bytes,
// plus a metadata fingerprint (size + GPS present) so we can tell byte drift from real drift.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { TARGETS, MARKER } from "./safety.ts";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function gpsCount(files: string[]): number {
  const jpgs = files.filter((f) => /\.jpe?g$/i.test(f));
  if (!jpgs.length) return 0;
  try {
    const out = execFileSync("exiftool", ["-q", "-if", "$gpslatitude", "-p", "1", ...jpgs], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

const mode = process.argv[2] || "bytes"; // "bytes" | "meta"
const all: string[] = [];
for (const dir of Object.values(TARGETS)) {
  if (fs.existsSync(dir)) all.push(...walk(dir));
}
all.sort();

if (mode === "meta") {
  // metadata manifest: relative path + size, ignoring MARKER, plus total GPS count.
  for (const f of all) {
    if (path.basename(f) === MARKER) continue;
    const rel = f.replace(process.env.HOME || "", "~");
    console.log(`${fs.statSync(f).size}\t${rel}`);
  }
  console.log(`GPS\t${gpsCount(all)}`);
} else {
  for (const f of all) {
    if (path.basename(f) === MARKER) continue;
    const h = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 16);
    const rel = f.replace(process.env.HOME || "", "~");
    console.log(`${h}  ${rel}`);
  }
}
