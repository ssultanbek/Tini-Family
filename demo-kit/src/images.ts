// Placeholder photos (SVG drawn by sharp) and EXIF writing (piexifjs, pure JS, deterministic).
import sharp from "sharp";
import piexif from "piexifjs";
import type { Rng } from "./rng.ts";

sharp.cache(false);
sharp.concurrency(1); // one thread per image; we run images in parallel instead

// ---------- EXIF ----------

export type Gps = { lat: number; lon: number; alt?: number };
export type ExifSpec = {
  date?: string; // "YYYY:MM:DD HH:MM:SS"
  make?: string;
  model?: string;
  gps?: Gps;
  artist?: string;
  ownerName?: string;
  bodySerial?: string;
  description?: string;
};

function dms(v: number): [number, number][] {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const mFloat = (a - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 100);
  return [[d, 1], [m, 1], [s, 100]];
}

export function withExif(jpeg: Buffer, spec: ExifSpec): Buffer {
  const zeroth: Record<number, unknown> = {};
  const exif: Record<number, unknown> = {};
  const gps: Record<number, unknown> = {};
  if (spec.make) zeroth[piexif.ImageIFD.Make] = spec.make;
  if (spec.model) zeroth[piexif.ImageIFD.Model] = spec.model;
  if (spec.artist) zeroth[piexif.ImageIFD.Artist] = spec.artist;
  if (spec.description) zeroth[piexif.ImageIFD.ImageDescription] = spec.description;
  if (spec.date) {
    zeroth[piexif.ImageIFD.DateTime] = spec.date;
    exif[piexif.ExifIFD.DateTimeOriginal] = spec.date;
    exif[piexif.ExifIFD.DateTimeDigitized] = spec.date;
  }
  if (spec.ownerName) exif[piexif.ExifIFD.CameraOwnerName] = spec.ownerName;
  if (spec.bodySerial) exif[piexif.ExifIFD.BodySerialNumber] = spec.bodySerial;
  if (spec.gps) {
    gps[piexif.GPSIFD.GPSVersionID] = [2, 3, 0, 0];
    gps[piexif.GPSIFD.GPSLatitudeRef] = spec.gps.lat >= 0 ? "N" : "S";
    gps[piexif.GPSIFD.GPSLatitude] = dms(spec.gps.lat);
    gps[piexif.GPSIFD.GPSLongitudeRef] = spec.gps.lon >= 0 ? "E" : "W";
    gps[piexif.GPSIFD.GPSLongitude] = dms(spec.gps.lon);
    if (spec.gps.alt !== undefined) {
      gps[piexif.GPSIFD.GPSAltitudeRef] = 0;
      gps[piexif.GPSIFD.GPSAltitude] = [Math.round(spec.gps.alt * 10), 10];
    }
  }
  const bytes = piexif.dump({ "0th": zeroth, Exif: exif, GPS: gps });
  const out = piexif.insert(bytes, jpeg.toString("binary"));
  return Buffer.from(out, "binary");
}

// ---------- drawing helpers ----------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hsl = (h: number, s: number, l: number) => `hsl(${h.toFixed(0)},${s.toFixed(0)}%,${l.toFixed(0)}%)`;

async function render(svg: string, quality: number): Promise<Buffer> {
  return sharp(Buffer.from(svg)).jpeg({ quality, chromaSubsampling: "4:2:0" }).toBuffer();
}

function sky(r: Rng, w: number, h: number, id: string): string {
  const hue = r.range(195, 215);
  const top = hsl(hue, r.range(55, 75), r.range(38, 50));
  const bottom = hsl(hue - r.range(0, 25), r.range(40, 65), r.range(75, 88));
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#${id})"/>`;
}

function captionBar(w: number, h: number, text: string): string {
  const bh = Math.round(h * 0.09);
  const fs = Math.round(bh * 0.5);
  return `<rect x="0" y="${h - bh}" width="${w}" height="${bh}" fill="#000" fill-opacity="0.55"/>
<text x="${Math.round(w * 0.03)}" y="${h - bh / 2 + fs * 0.35}" font-family="Helvetica, Arial, sans-serif" font-size="${fs}" fill="#fff" font-weight="bold">${esc(text)}</text>`;
}

// ---------- construction scenes ----------

export const SCENES = ["framing", "foundation", "roofing", "concrete", "renovation", "exterior", "interior", "site-prep"] as const;
export type Scene = (typeof SCENES)[number];

function construction(r: Rng, scene: Scene, w: number, h: number): string {
  const ground = h * r.range(0.66, 0.74);
  const dirt = hsl(r.range(25, 35), r.range(30, 45), r.range(30, 42));
  let s = sky(r, w, h, "sky");
  // distant palms / skyline
  for (let i = 0; i < 6; i++) {
    const x = r.range(0, w), bh = r.range(h * 0.08, h * 0.22), bw = r.range(w * 0.04, w * 0.1);
    s += `<rect x="${x}" y="${ground - bh}" width="${bw}" height="${bh}" fill="${hsl(210, 15, r.range(60, 72))}"/>`;
  }
  s += `<rect x="0" y="${ground}" width="${w}" height="${h - ground}" fill="${dirt}"/>`;
  const bx = w * r.range(0.18, 0.3), bw = w * r.range(0.42, 0.55), bh = h * r.range(0.3, 0.4);
  const top = ground - bh;
  const wood = hsl(r.range(30, 40), 55, r.range(58, 68));
  const concrete = hsl(0, 0, r.range(62, 74));
  if (scene === "framing" || scene === "roofing") {
    const studs = Math.round(r.range(10, 16));
    for (let i = 0; i <= studs; i++) {
      const x = bx + (bw * i) / studs;
      s += `<rect x="${x - 4}" y="${top}" width="8" height="${bh}" fill="${wood}"/>`;
    }
    s += `<rect x="${bx - 6}" y="${top - 6}" width="${bw + 12}" height="12" fill="${wood}"/>`;
    s += `<rect x="${bx - 6}" y="${ground - 10}" width="${bw + 12}" height="12" fill="${wood}"/>`;
    const peak = top - bh * r.range(0.45, 0.6);
    if (scene === "roofing") {
      s += `<polygon points="${bx - 30},${top} ${bx + bw / 2},${peak} ${bx + bw + 30},${top}" fill="${hsl(r.range(0, 20), 30, 30)}"/>`;
      for (let k = 1; k < 8; k++) {
        const y = top - ((top - peak) * k) / 8;
        const half = ((bw / 2 + 30) * (y - peak)) / (top - peak);
        s += `<line x1="${bx + bw / 2 - half}" y1="${y}" x2="${bx + bw / 2 + half}" y2="${y}" stroke="#222" stroke-opacity="0.35" stroke-width="3"/>`;
      }
    } else {
      for (let i = 0; i <= 6; i++) {
        const x = bx + (bw * i) / 6;
        s += `<line x1="${x}" y1="${top}" x2="${bx + bw / 2}" y2="${peak}" stroke="${wood}" stroke-width="7"/>`;
      }
      s += `<line x1="${bx}" y1="${top}" x2="${bx + bw / 2}" y2="${peak}" stroke="${wood}" stroke-width="10"/>`;
      s += `<line x1="${bx + bw}" y1="${top}" x2="${bx + bw / 2}" y2="${peak}" stroke="${wood}" stroke-width="10"/>`;
    }
  } else if (scene === "foundation" || scene === "concrete" || scene === "site-prep") {
    const slabY = ground - h * 0.05;
    s += `<rect x="${bx}" y="${slabY}" width="${bw}" height="${h * 0.08}" fill="${concrete}"/>`;
    if (scene !== "concrete") {
      for (let i = 0; i < 18; i++) {
        const x = bx + (bw * i) / 17;
        s += `<line x1="${x}" y1="${slabY}" x2="${x}" y2="${slabY - h * 0.12}" stroke="#7a4b2a" stroke-width="4"/>`;
      }
    }
    // mixer truck / excavator block
    const tx = w * r.range(0.62, 0.75);
    s += `<rect x="${tx}" y="${ground - h * 0.16}" width="${w * 0.2}" height="${h * 0.11}" fill="${hsl(45, 90, 52)}"/>`;
    s += `<ellipse cx="${tx + w * 0.07}" cy="${ground - h * 0.2}" rx="${w * 0.07}" ry="${h * 0.07}" fill="${scene === "concrete" ? "#ddd" : hsl(45, 90, 45)}"/>`;
    for (const dx of [0.04, 0.16]) s += `<circle cx="${tx + w * dx}" cy="${ground - h * 0.04}" r="${h * 0.035}" fill="#222"/>`;
  } else {
    // renovation / exterior / interior: a finished-ish house
    const wall = hsl(r.range(30, 60), r.range(15, 35), r.range(80, 90));
    s += `<rect x="${bx}" y="${top}" width="${bw}" height="${bh}" fill="${wall}"/>`;
    s += `<polygon points="${bx - 25},${top} ${bx + bw / 2},${top - bh * 0.45} ${bx + bw + 25},${top}" fill="${hsl(r.range(5, 20), 45, 38)}"/>`;
    const win = hsl(200, 50, scene === "interior" ? 85 : 55);
    for (let i = 0; i < 3; i++)
      s += `<rect x="${bx + bw * (0.1 + i * 0.3)}" y="${top + bh * 0.2}" width="${bw * 0.18}" height="${bh * 0.28}" fill="${win}" stroke="#fff" stroke-width="5"/>`;
    s += `<rect x="${bx + bw * 0.44}" y="${top + bh * 0.58}" width="${bw * 0.12}" height="${bh * 0.42}" fill="${hsl(25, 50, 30)}"/>`;
    if (scene === "renovation") {
      for (let i = 0; i < 5; i++) {
        const y = top + (bh * i) / 5;
        s += `<line x1="${bx - 20}" y1="${y}" x2="${bx + bw + 20}" y2="${y}" stroke="#555" stroke-width="5"/>`;
      }
      s += `<line x1="${bx - 20}" y1="${top}" x2="${bx - 20}" y2="${ground}" stroke="#555" stroke-width="6"/>`;
      s += `<line x1="${bx + bw + 20}" y1="${top}" x2="${bx + bw + 20}" y2="${ground}" stroke="#555" stroke-width="6"/>`;
    }
  }
  // safety cones
  for (let i = 0; i < 3; i++) {
    const cx = r.range(w * 0.05, w * 0.95), cy = r.range(ground + 20, h * 0.86);
    s += `<polygon points="${cx - 14},${cy} ${cx},${cy - 40} ${cx + 14},${cy}" fill="#f60"/><rect x="${cx - 18}" y="${cy}" width="36" height="6" fill="#f60"/>`;
  }
  return s;
}

export async function constructionPhoto(r: Rng, scene: Scene, caption: string, w = 1200, h = 800): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${construction(r, scene, w, h)}${captionBar(w, h, caption)}</svg>`;
  return render(svg, 82);
}

export async function crewTruckPhoto(r: Rng, plate: string, w = 1200, h = 800): Promise<Buffer> {
  const ground = h * 0.72;
  let s = sky(r, w, h, "sky");
  s += `<rect x="0" y="${ground}" width="${w}" height="${h - ground}" fill="#6b6b6b"/>`;
  // pickup truck
  const tx = w * 0.12, ty = ground - h * 0.3;
  s += `<rect x="${tx}" y="${ty + h * 0.08}" width="${w * 0.55}" height="${h * 0.17}" rx="14" fill="#f4f4f4" stroke="#333" stroke-width="3"/>`;
  s += `<path d="M ${tx + w * 0.3} ${ty + h * 0.08} L ${tx + w * 0.34} ${ty - h * 0.02} L ${tx + w * 0.5} ${ty - h * 0.02} L ${tx + w * 0.55} ${ty + h * 0.08} Z" fill="#f4f4f4" stroke="#333" stroke-width="3"/>`;
  s += `<rect x="${tx + w * 0.355}" y="${ty}" width="${w * 0.13}" height="${h * 0.065}" fill="#8fb8d8"/>`;
  s += `<text x="${tx + w * 0.03}" y="${ty + h * 0.18}" font-family="Helvetica, Arial, sans-serif" font-size="${h * 0.045}" font-weight="bold" fill="#b3261e">RIVERA CONSTRUCTION</text>`;
  for (const dx of [0.1, 0.45]) {
    s += `<circle cx="${tx + w * dx}" cy="${ground - h * 0.03}" r="${h * 0.06}" fill="#1c1c1c"/><circle cx="${tx + w * dx}" cy="${ground - h * 0.03}" r="${h * 0.025}" fill="#999"/>`;
  }
  // license plate on the tailgate
  const px = tx - w * 0.005, py = ty + h * 0.11;
  s += `<rect x="${px - w * 0.1}" y="${py}" width="${w * 0.1}" height="${h * 0.075}" rx="6" fill="#fff" stroke="#222" stroke-width="3"/>`;
  s += `<text x="${px - w * 0.05}" y="${py + h * 0.02}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${h * 0.017}" fill="#1b5e20" font-weight="bold">FLORIDA</text>`;
  s += `<text x="${px - w * 0.05}" y="${py + h * 0.058}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${h * 0.034}" fill="#e65100" font-weight="bold">${esc(plate)}</text>`;
  // worker with a face
  const fx = w * 0.8, fy = ground - h * 0.36;
  s += `<rect x="${fx - w * 0.045}" y="${fy + h * 0.08}" width="${w * 0.09}" height="${h * 0.22}" rx="18" fill="#f57c00"/>`;
  s += `<circle cx="${fx}" cy="${fy + h * 0.02}" r="${h * 0.065}" fill="#c68642"/>`;
  s += `<path d="M ${fx - h * 0.075} ${fy - h * 0.02} Q ${fx} ${fy - h * 0.1} ${fx + h * 0.075} ${fy - h * 0.02} Z" fill="#fdd835"/>`;
  s += `<circle cx="${fx - h * 0.022}" cy="${fy + h * 0.01}" r="${h * 0.008}" fill="#222"/><circle cx="${fx + h * 0.022}" cy="${fy + h * 0.01}" r="${h * 0.008}" fill="#222"/>`;
  s += `<path d="M ${fx - h * 0.025} ${fy + h * 0.045} Q ${fx} ${fy + h * 0.065} ${fx + h * 0.025} ${fy + h * 0.045}" stroke="#222" stroke-width="3" fill="none"/>`;
  s += captionBar(w, h, "Rivera Construction · crew truck");
  return render(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${s}</svg>`, 82);
}

// ---------- personal-photo stand-ins ----------

const THEMES = ["beach", "sunset", "park", "party", "portrait", "food", "night", "snow"] as const;

export async function personalPhoto(r: Rng, w = 320, h = 240): Promise<Buffer> {
  const theme = r.pick(THEMES);
  let s = "";
  const horizon = h * r.range(0.45, 0.65);
  if (theme === "beach" || theme === "sunset") {
    const warm = theme === "sunset";
    s += `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${warm ? hsl(r.range(260, 290), 50, 35) : hsl(200, 70, 55)}"/><stop offset="1" stop-color="${warm ? hsl(r.range(15, 35), 90, 60) : hsl(195, 60, 85)}"/></linearGradient></defs>`;
    s += `<rect width="${w}" height="${h}" fill="url(#g)"/>`;
    s += `<circle cx="${r.range(w * 0.2, w * 0.8)}" cy="${horizon - r.range(5, 40)}" r="${r.range(12, 28)}" fill="${warm ? "#ffcc66" : "#fff6c0"}"/>`;
    s += `<rect y="${horizon}" width="${w}" height="${h * 0.2}" fill="${hsl(r.range(190, 205), 60, warm ? 35 : 45)}"/>`;
    s += `<rect y="${horizon + h * 0.2}" width="${w}" height="${h}" fill="${hsl(42, 55, warm ? 55 : 75)}"/>`;
  } else if (theme === "park" || theme === "snow") {
    const snow = theme === "snow";
    s += `<rect width="${w}" height="${h}" fill="${snow ? hsl(210, 20, 80) : hsl(200, 60, 70)}"/>`;
    s += `<rect y="${horizon}" width="${w}" height="${h}" fill="${snow ? "#f4f6f8" : hsl(r.range(95, 125), 45, 40)}"/>`;
    for (let i = 0; i < r.int(3, 7); i++) {
      const x = r.range(0, w), th = r.range(30, 70);
      s += `<rect x="${x - 3}" y="${horizon - th * 0.4}" width="6" height="${th * 0.5}" fill="#5d4037"/><circle cx="${x}" cy="${horizon - th * 0.5}" r="${th * 0.35}" fill="${snow ? "#e0e8ee" : hsl(r.range(90, 130), 50, r.range(25, 40))}"/>`;
    }
  } else if (theme === "party" || theme === "night") {
    s += `<rect width="${w}" height="${h}" fill="${hsl(r.range(220, 280), 40, theme === "night" ? 10 : 22)}"/>`;
    for (let i = 0; i < r.int(15, 40); i++)
      s += `<circle cx="${r.range(0, w)}" cy="${r.range(0, h)}" r="${r.range(2, theme === "night" ? 4 : 12)}" fill="${hsl(r.range(0, 360), 80, 65)}" fill-opacity="${r.range(0.4, 0.9).toFixed(2)}"/>`;
  } else if (theme === "portrait") {
    s += `<rect width="${w}" height="${h}" fill="${hsl(r.range(0, 360), 25, r.range(55, 80))}"/>`;
    const cx = w * r.range(0.4, 0.6);
    s += `<ellipse cx="${cx}" cy="${h}" rx="${w * 0.28}" ry="${h * 0.35}" fill="${hsl(r.range(0, 360), 45, 40)}"/>`;
    s += `<circle cx="${cx}" cy="${h * 0.45}" r="${h * 0.2}" fill="${hsl(r.range(20, 35), 45, r.range(35, 75))}"/>`;
  } else {
    s += `<rect width="${w}" height="${h}" fill="${hsl(r.range(20, 40), 30, r.range(40, 60))}"/>`;
    s += `<circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.38}" fill="#fafafa"/>`;
    for (let i = 0; i < r.int(4, 9); i++)
      s += `<circle cx="${w / 2 + r.range(-h * 0.22, h * 0.22)}" cy="${h / 2 + r.range(-h * 0.22, h * 0.22)}" r="${r.range(8, 22)}" fill="${hsl(r.range(0, 120), 65, 50)}"/>`;
  }
  return render(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${s}</svg>`, 72);
}

// Real photos from demo-kit/inputs: fix orientation, resize, drop all original metadata.
export async function normalizeReal(file: string, maxWidth = 1600): Promise<Buffer> {
  return sharp(file).rotate().resize({ width: maxWidth, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
}
