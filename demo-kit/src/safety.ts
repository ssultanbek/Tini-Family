// Delete guard for the demo kit. The kit only ever deletes the four exact
// target folders below, and only when they carry the marker file it wrote.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MARKER = ".tini-demo-kit";
export const MARKER_TEXT =
  "Created by the Tini Family demo kit (npm run demo-kit). Safe for the kit to delete and rebuild.\n";

// TINI_DEMO_HOME lets tests point the kit at a scratch folder instead of the real home.
export const HOME = path.resolve(process.env.TINI_DEMO_HOME || os.homedir());

export const TARGETS = {
  rivera: path.join(HOME, "Clients", "Rivera"),
  jobsite: path.join(HOME, "Pictures", "Jobsite2024"),
  hr: path.join(HOME, "Documents", "Rivera-HR"),
  tiniDemo: path.join(HOME, "tini-demo"),
} as const;

const ALLOWED = new Set<string>(Object.values(TARGETS));

export class RefuseError extends Error {}

function hasMarker(dir: string): boolean {
  try {
    return fs.lstatSync(path.join(dir, MARKER)).isFile();
  } catch {
    return false;
  }
}

// Checks one target. Returns true if it exists (and is safe to delete), false if absent.
// Throws RefuseError if it exists but the kit didn't create it.
function check(dir: string): boolean {
  if (!ALLOWED.has(dir)) throw new RefuseError(`not a demo-kit target: ${dir}`);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(dir);
  } catch {
    return false;
  }
  if (st.isSymbolicLink()) throw new RefuseError(`${dir} is a symlink; refusing to touch it`);
  if (!st.isDirectory()) throw new RefuseError(`${dir} exists and is not a folder; refusing to touch it`);
  if (!hasMarker(dir))
    throw new RefuseError(
      `${dir} exists but has no ${MARKER} marker, so the demo kit did not create it. ` +
        `Refusing to delete it. Move or rename it yourself if you want the demo kit here.`,
    );
  return true;
}

// Checks all four targets first; deletes nothing unless every one is absent or marked.
export function removeTargets(): void {
  const dirs = Object.values(TARGETS);
  const present = dirs.filter(check);
  for (const dir of present) {
    if (!check(dir)) continue; // re-check right before deleting
    fs.rmSync(dir, { recursive: true, force: false });
  }
}

export function createTarget(dir: string): void {
  if (!ALLOWED.has(dir)) throw new RefuseError(`not a demo-kit target: ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MARKER), MARKER_TEXT);
}

export function markerPresent(dir: string): boolean {
  return hasMarker(dir);
}
