// Seeded randomness. Every item gets its own stream from hash(seed + label),
// so output never depends on the order async work finishes in.
import crypto from "node:crypto";

export const SEED = process.env.DEMO_SEED || "rivera-2026";

export type Rng = {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  pick<T>(arr: readonly T[]): T;
  range(min: number, max: number): number;
  shuffle<T>(arr: T[]): T[];
};

export function rng(label: string): Rng {
  const h = crypto.createHash("sha256").update(`${SEED}:${label}`).digest();
  // sfc32
  let a = h.readUInt32LE(0), b = h.readUInt32LE(4), c = h.readUInt32LE(8), d = h.readUInt32LE(12);
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const r: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    range: (min, max) => min + next() * (max - min),
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
  return r;
}

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function token(label: string, len: number, alphabet = ALNUM): string {
  const r = rng(label);
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(r.next() * alphabet.length)];
  return s;
}
