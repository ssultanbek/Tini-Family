// Miami-area coordinates, deterministic per label.
import { rng } from "./rng.ts";

// Rough bounding box around Miami-Dade job sites.
const LAT = [25.68, 25.86];
const LON = [-80.42, -80.13];

export function miamiGps(label: string): { lat: number; lon: number; alt: number } {
  const r = rng(`gps:${label}`);
  return {
    lat: Number(r.range(LAT[0], LAT[1]).toFixed(6)),
    lon: Number(r.range(LON[0], LON[1]).toFixed(6)),
    alt: Number(r.range(1, 6).toFixed(1)),
  };
}

// Deterministic EXIF datetime spread across 2024.
export function photoDate(label: string): string {
  const r = rng(`date:${label}`);
  const month = r.int(1, 12);
  const day = r.int(1, 28);
  const hour = r.int(7, 18);
  const min = r.int(0, 59);
  const sec = r.int(0, 59);
  const p = (n: number) => String(n).padStart(2, "0");
  return `2024:${p(month)}:${p(day)} ${p(hour)}:${p(min)}:${p(sec)}`;
}
