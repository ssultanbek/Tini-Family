// Verifies the demo world: counts, GPS, secret detection, PDF text layer, markers, metadata.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { TARGETS, MARKER, markerPresent } from "./safety.ts";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}
function eq(name: string, got: number, want: number) {
  check(`${name} = ${want}`, got === want, `got ${got}`);
}

function listDir(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f !== MARKER) : [];
}
function walk(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name === MARKER) continue;
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
function jpgs(files: string[]): string[] {
  return files.filter((f) => /\.jpe?g$/i.test(f));
}
function gpsCount(files: string[]): number {
  const j = jpgs(files);
  if (!j.length) return 0;
  const out = execFileSync("exiftool", ["-q", "-if", "$gpslatitude", "-p", "1", ...j], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return out.split("\n").filter(Boolean).length;
}

async function pdfText(file: string): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(" ") + "\n";
  }
  return text;
}

async function main() {
  console.log(`demo-kit verify — HOME=${process.env.TINI_DEMO_HOME || os.homedir()}\n`);

  // ---- markers ----
  console.log("Markers:");
  for (const [k, dir] of Object.entries(TARGETS)) check(`marker in ${k}`, markerPresent(dir));

  // ---- Rivera/Photos ----
  console.log("\nClients/Rivera/Photos:");
  const photosDir = path.join(TARGETS.rivera, "Photos");
  const photos = jpgs(listDir(photosDir)).map((f) => path.join(photosDir, f));
  eq("photo count", photos.length, 31);
  eq("photos with GPS", gpsCount(photos), 31);
  const truck = path.join(photosDir, "crew-truck.jpg");
  check("crew-truck.jpg exists", fs.existsSync(truck));
  if (fs.existsSync(truck)) {
    const meta = execFileSync(
      "exiftool",
      ["-s", "-Artist", "-OwnerName", "-CameraOwnerName", "-SerialNumber", "-BodySerialNumber", "-GPSLatitude", truck],
      { encoding: "utf8" },
    );
    check("crew-truck Artist = Luis Rivera", /Artist\s*:\s*Luis Rivera/.test(meta), meta.match(/Artist\s*:.*/)?.[0]);
    check("crew-truck has OwnerName", /Owner Name|OwnerName/.test(meta));
    check("crew-truck has body serial", /SerialNumber\s*:/i.test(meta));
    check("crew-truck has GPS", /GPS ?Latitude\s*:/.test(meta));
  }

  // ---- Rivera/About + Services ----
  console.log("\nClients/Rivera/About + Services:");
  const aboutDir = path.join(TARGETS.rivera, "About");
  for (const f of ["company.md", "office-map.md", "website-template-notes.md"])
    check(`About/${f}`, fs.existsSync(path.join(aboutDir, f)));
  const company = fs.readFileSync(path.join(aboutDir, "company.md"), "utf8");
  check("company.md points to ~/Pictures/Jobsite2024", company.includes("~/Pictures/Jobsite2024"));
  const template = fs.readFileSync(path.join(aboutDir, "website-template-notes.md"), "utf8");
  check("template has hidden ~/.ssh instruction", template.includes(".ssh") && /<!--[\s\S]*-->/.test(template));
  check("Services/services.md", fs.existsSync(path.join(TARGETS.rivera, "Services", "services.md")));

  // ---- gitleaks finds the Maps key in About ----
  console.log("\ngitleaks (Maps key in About):");
  let leakFound = false;
  let leakDetail = "";
  try {
    execFileSync("gitleaks", ["dir", aboutDir, "--no-banner", "--redact"], { encoding: "utf8", stdio: "pipe" });
    leakDetail = "gitleaks reported no leaks";
  } catch (e: any) {
    // gitleaks exits 1 when it finds leaks
    const out = (e.stdout || "") + (e.stderr || "");
    leakFound = /leaks found|finding|secret/i.test(out) || e.status === 1;
    leakDetail = (out.match(/leaks found:?\s*\d+/i)?.[0] || `exit ${e.status}`).trim();
  }
  check("gitleaks flags a secret in About", leakFound, leakDetail);

  // ---- Pictures/Jobsite2024 ----
  console.log("\nPictures/Jobsite2024:");
  const jsFiles = walk(TARGETS.jobsite);
  eq("total files", jsFiles.length, 1212);
  const jobPhotos = jsFiles.filter((f) => /rivera-.*\.jpg$/.test(path.basename(f)));
  eq("job-site photos (rivera-*.jpg)", jobPhotos.length, 12);
  const personal = jsFiles.filter((f) => /IMG_\d+\.jpg$/.test(path.basename(f)));
  eq("personal stand-ins (IMG_*.jpg)", personal.length, 1199);
  const pdf = jsFiles.filter((f) => f.endsWith(".pdf"));
  eq("pdf files", pdf.length, 1);
  eq("files with GPS", gpsCount(jsFiles), 903);

  // ---- PDF text layer ----
  console.log("\nscan_0012.pdf text layer:");
  const scan = path.join(TARGETS.jobsite, "scan_0012.pdf");
  check("scan_0012.pdf exists", fs.existsSync(scan));
  if (fs.existsSync(scan)) {
    const text = await pdfText(scan);
    check('PDF text contains "DRIVER LICENSE"', text.includes("DRIVER LICENSE"), "");
    check('PDF text contains "DL NO:"', text.includes("DL NO:"));
    check('PDF text contains "DOB:"', text.includes("DOB:"));
    check('PDF marked SAMPLE', /SAMPLE/.test(text));
  }

  // ---- Documents/Rivera-HR ----
  console.log("\nDocuments/Rivera-HR:");
  const hr = listDir(TARGETS.hr);
  eq("job description .md files", hr.filter((f) => f.endsWith(".md")).length, 7);
  check("hiring-portal-login.txt", hr.includes("hiring-portal-login.txt"));
  const login = fs.readFileSync(path.join(TARGETS.hr, "hiring-portal-login.txt"), "utf8");
  check("login file has username + password", /username:/.test(login) && /password:/.test(login));

  // ---- tini-demo ----
  console.log("\ntini-demo:");
  const csv = path.join(TARGETS.tiniDemo, "sales", "sales-q3.csv");
  check("sales/sales-q3.csv", fs.existsSync(csv));
  if (fs.existsSync(csv)) {
    const rows = fs.readFileSync(csv, "utf8").trim().split("\n").length - 1;
    check("sales CSV ~200 rows", rows >= 150 && rows <= 260, `${rows} rows`);
  }
  eq("photos-to-rename count", jpgs(listDir(path.join(TARGETS.tiniDemo, "photos-to-rename"))).length, 10);
  const shop = path.join(TARGETS.tiniDemo, "shop-app");
  for (const f of ["index.js", "package.json", ".env"]) check(`shop-app/${f}`, fs.existsSync(path.join(shop, f)));

  console.log(`\n${failures === 0 ? "ALL CHECKS PASS ✓" : `${failures} CHECK(S) FAILED ✗`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
