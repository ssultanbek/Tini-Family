// Batched photo metadata: ONE exiftool process per folder instead of one request per
// file, so a 1,200-photo folder is read (or cleaned) in a couple of seconds. Uses the
// exiftool bundled with exiftool-vendored, so there's no Homebrew dependency.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
function exiftoolBin(): string {
  const pkg = process.platform === "win32" ? "exiftool-vendored.exe" : "exiftool-vendored.pl";
  return path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "bin", process.platform === "win32" ? "exiftool.exe" : "exiftool");
}

/** Runs exiftool with the file list on stdin (-@ -), so there's no argv length limit. */
function run(args: string[], files: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn(exiftoolBin(), [...args, "-@", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    p.stdout.setEncoding("utf8").on("data", (d) => { stdout += d; });
    p.stderr.setEncoding("utf8").on("data", (d) => { stderr += d; });
    p.on("error", reject);
    p.on("close", (code) => resolve({ stdout, stderr, code: code ?? 1 }));
    p.stdin.end(files.join("\n") + "\n");
  });
}

/** GPS yes/no per file. Files exiftool couldn't read are missing from the map. */
async function readGps(files: string[]): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (!files.length) return map;
  const { stdout } = await run(["-json", "-n", "-fast2", "-q", "-q", "-GPSLatitude", "-GPSLongitude", "-GPSPosition"], files);
  let rows: Record<string, unknown>[] = [];
  try { rows = JSON.parse(stdout || "[]"); } catch { /* unreadable output: every file stays unknown */ }
  for (const r of rows) {
    map.set(path.resolve(String(r.SourceFile)), r.GPSLatitude !== undefined || r.GPSLongitude !== undefined || r.GPSPosition !== undefined);
  }
  return map;
}

/** Absolute paths of the files (among `files`) that carry a GPS position. */
export async function gpsFiles(files: string[]): Promise<Set<string>> {
  const map = await readGps(files);
  return new Set([...map].filter(([, gps]) => gps).map(([f]) => f));
}

/**
 * Removes GPS only (EXIF GPS IFD + XMP GPS tags) from COPIES, in place, in one process.
 * Returns the files that may still have GPS afterwards (still tagged, or unreadable);
 * the caller deletes them. Fail closed: "couldn't check" counts as "still has GPS".
 */
export async function stripGpsBatch(files: string[]): Promise<string[]> {
  if (!files.length) return [];
  await run(["-q", "-q", "-overwrite_original", "-gps:all=", "-xmp:gps*="], files);
  const after = await readGps(files);
  return files.filter((f) => after.get(path.resolve(f)) !== false);
}

/** Identifying tags we look for in published photos (exiftool JSON key names). */
export const IDENTIFYING_TAGS = ["GPSLatitude", "GPSLongitude", "Artist", "OwnerName", "SerialNumber", "Creator", "By-line"] as const;

/** Reads the identifying tags from many files in one exiftool process. Keyed by absolute path. */
export async function identifyingTags(files: string[]): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>();
  if (!files.length) return out;
  const { stdout } = await run(["-json", "-n", "-fast2", "-q", "-q", ...IDENTIFYING_TAGS.map((t) => `-${t}`)], files);
  let rows: Record<string, unknown>[] = [];
  try { rows = JSON.parse(stdout || "[]"); } catch { /* treated as no tags */ }
  for (const r of rows) {
    const tags: Record<string, string> = {};
    for (const t of IDENTIFYING_TAGS) if (r[t] !== undefined && String(r[t]).trim() !== "") tags[t] = String(r[t]);
    out.set(path.resolve(String(r.SourceFile)), tags);
  }
  return out;
}

/** Removes ALL metadata from one photo (keeps orientation and colour profile so it still looks right). */
export async function stripAllMetadata(file: string): Promise<void> {
  await run(["-q", "-q", "-overwrite_original", "-all=", "-tagsFromFile", "@", "-Orientation", "-ICC_Profile"], [file]);
}
