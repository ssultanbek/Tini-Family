// Rebuilds the demo world deterministically. Safe: only ever deletes the four marked targets.
import fs from "node:fs";
import path from "node:path";
import { TARGETS, HOME, MARKER, removeTargets, createTarget, RefuseError } from "./safety.ts";
import { rng } from "./rng.ts";
import { miamiGps, photoDate } from "./geo.ts";
import {
  constructionPhoto,
  crewTruckPhoto,
  personalPhoto,
  normalizeReal,
  withExif,
  SCENES,
  type Scene,
} from "./images.ts";
import {
  companyMd,
  officeMapMd,
  templateNotesMd,
  servicesMd,
  jobs,
  hiringPortalLogin,
  shopAppFiles,
  shopEnv,
  salesCsv,
  driverLicensePdf,
} from "./content.ts";

const INPUTS = path.join(import.meta.dirname, "..", "inputs");
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

// Small parallel pool so 1,200 images don't all queue at once.
async function pool<T>(items: T[], limit: number, fn: (x: T, i: number) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

function write(file: string, data: string | Uint8Array) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function realInput(name: string): string | null {
  const p = path.join(INPUTS, name);
  return fs.existsSync(p) ? p : null;
}

// ---------- Clients/Rivera ----------

async function buildRivera() {
  const root = TARGETS.rivera;
  const photos = path.join(root, "Photos");
  fs.mkdirSync(photos, { recursive: true });

  // 31 photos, ALL with GPS. Index 0 is the crew truck.
  const realPhotos = fs.existsSync(path.join(INPUTS, "photos"))
    ? fs.readdirSync(path.join(INPUTS, "photos")).filter((f) => /\.jpe?g$/i.test(f)).sort()
    : [];

  const tasks = Array.from({ length: 31 }, (_, i) => i);
  await pool(tasks, 6, async (i) => {
    if (i === 0) {
      // crew-truck.jpg: GPS + extra identifying metadata.
      const r = rng("crew-truck");
      const plate = "R" + Math.floor(r.range(100, 999)) + "-" + Math.floor(r.range(1000, 9999));
      const real = realInput("crew-truck.jpg");
      const base = real ? await normalizeReal(real) : await crewTruckPhoto(r, plate);
      const out = withExif(base, {
        date: photoDate("crew-truck"),
        make: "Canon",
        model: "Canon EOS R6",
        gps: miamiGps("crew-truck"),
        artist: "Luis Rivera",
        ownerName: "Luis Rivera",
        bodySerial: "CN" + Math.floor(rng("serial").range(1e8, 9e8)),
        description: "Rivera Construction crew truck",
      });
      write(path.join(photos, "crew-truck.jpg"), out);
      return;
    }
    const scene = SCENES[(i - 1) % SCENES.length] as Scene;
    const seq = String(Math.floor((i - 1) / SCENES.length) + 1).padStart(2, "0");
    const caption = `Rivera Construction · ${scene} ${seq}`;
    const label = `rivera-photo-${i}`;
    const r = rng(label);
    // use real inputs first if available, cycling through them
    let base: Buffer;
    if (realPhotos.length) {
      base = await normalizeReal(path.join(INPUTS, "photos", realPhotos[(i - 1) % realPhotos.length]));
    } else {
      base = await constructionPhoto(r, scene, caption);
    }
    const out = withExif(base, {
      date: photoDate(label),
      make: "Apple",
      model: "iPhone 14 Pro",
      gps: miamiGps(label),
      description: caption,
    });
    write(path.join(photos, `${scene}-${seq}.jpg`), out);
  });
  log("Rivera/Photos: 31 photos (all GPS, crew-truck.jpg extra metadata)");

  write(path.join(root, "About", "company.md"), companyMd);
  write(path.join(root, "About", "office-map.md"), officeMapMd());
  write(path.join(root, "About", "website-template-notes.md"), templateNotesMd);
  write(path.join(root, "Services", "services.md"), servicesMd);
  log("Rivera/About + Services written");
}

// ---------- Pictures/Jobsite2024 ----------

async function buildJobsite() {
  const root = TARGETS.jobsite;
  fs.mkdirSync(root, { recursive: true });

  // 1,212 files total: 12 job-site photos + 1,199 personal + 1 PDF.
  // Exactly 903 have GPS: all 12 job-site + 891 of the personal photos.
  const jobScenes: Scene[] = ["framing", "roofing", "concrete", "foundation", "renovation", "exterior", "framing", "roofing", "concrete", "foundation", "renovation", "interior"];
  await pool(jobScenes, 6, async (scene, idx) => {
    const n = String(idx + 1).padStart(2, "0");
    const label = `jobsite-${scene}-${n}`;
    const base = await constructionPhoto(rng(label), scene, `Rivera · ${scene} ${n}`);
    const out = withExif(base, { date: photoDate(label), make: "Apple", model: "iPhone 13", gps: miamiGps(label), description: `job site ${scene}` });
    write(path.join(root, `rivera-${scene}-${n}.jpg`), out);
  });
  log("Jobsite2024: 12 job-site photos");

  // 1,199 personal stand-ins; first 891 get GPS.
  const personal = Array.from({ length: 1199 }, (_, i) => i);
  await pool(personal, 8, async (i) => {
    const label = `personal-${i}`;
    const base = await personalPhoto(rng(label));
    const spec: Parameters<typeof withExif>[1] = { date: photoDate(label), make: "Apple", model: "iPhone 12" };
    if (i < 891) spec.gps = miamiGps(label);
    const out = withExif(base, spec);
    const name = `IMG_${String(1000 + i).padStart(4, "0")}.jpg`;
    write(path.join(root, name), out);
  });
  log("Jobsite2024: 1,199 personal stand-ins (891 with GPS)");

  const pdf = await driverLicensePdf();
  write(path.join(root, "scan_0012.pdf"), pdf);
  log("Jobsite2024: scan_0012.pdf (fake FL license)");
}

// ---------- Documents/Rivera-HR ----------

function buildHR() {
  const root = TARGETS.hr;
  fs.mkdirSync(root, { recursive: true });
  for (const j of jobs) write(path.join(root, j.file), j.body);
  write(path.join(root, "hiring-portal-login.txt"), hiringPortalLogin());
  log("Rivera-HR: 7 job descriptions + login file");
}

// ---------- tini-demo ----------

async function buildTiniDemo() {
  const root = TARGETS.tiniDemo;
  fs.mkdirSync(root, { recursive: true });

  write(path.join(root, "sales", "sales-q3.csv"), salesCsv(200));

  const renameDir = path.join(root, "photos-to-rename");
  fs.mkdirSync(renameDir, { recursive: true });
  const ten = Array.from({ length: 10 }, (_, i) => i);
  await pool(ten, 6, async (i) => {
    const label = `rename-${i}`;
    const base = await personalPhoto(rng(label), 480, 360);
    const out = withExif(base, { date: photoDate(label), make: "Apple", model: "iPhone 11" });
    write(path.join(renameDir, `IMG_${String(2000 + i).padStart(4, "0")}.jpg`), out);
  });

  for (const [name, body] of Object.entries(shopAppFiles)) write(path.join(root, "shop-app", name), body);
  write(path.join(root, "shop-app", ".env"), shopEnv());
  log("tini-demo: sales CSV, 10 photos-to-rename, shop-app + .env");
}

async function main() {
  console.log(`demo-kit: rebuilding under ${HOME}`);
  try {
    removeTargets();
  } catch (e) {
    if (e instanceof RefuseError) {
      console.error(`\nREFUSED: ${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }
  for (const dir of Object.values(TARGETS)) createTarget(dir);
  log("targets removed and re-created (markers written)");

  await buildRivera();
  await buildJobsite();
  buildHR();
  await buildTiniDemo();

  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Marker file in each target: ${MARKER}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
