import { diorama as D, yardLayout as L } from '../layout.ts';

/** Pure geometry for the 3D diorama: yard pixels (layout.ts) → world units. No three.js here, so it is unit-testable. */
export type XZ = { x: number; z: number };

export function toWorld(x: number, y: number): XZ {
  return { x: (x - D.center.x) * D.unit, z: (y - D.center.y) * D.unit };
}

/** The floating land block: centre and size on the ground plane. */
export function blockBox() {
  const a = toWorld(D.block.minX, D.block.minY), b = toWorld(D.block.maxX, D.block.maxY);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, width: b.x - a.x, depth: b.z - a.z };
}

/** A pixel rectangle as a world box (centre + size). */
export function rectBox(r: { x: number; y: number; width: number; height: number }) {
  const c = toWorld(r.x + r.width / 2, r.y + r.height / 2);
  return { ...c, width: r.width * D.unit, depth: r.height * D.unit };
}

type Slot = (typeof L.slots)[number];

/** Post positions along one fence slot (horizontal slots run along x, vertical ones along z). */
export function fencePosts(slot: Slot): XZ[] {
  const c = toWorld(slot.x, slot.y), half = (L.fence.length * D.unit) / 2, n = D.fence.posts;
  return Array.from({ length: n }, (_, i) => {
    const d = -half + (2 * half * i) / (n - 1);
    return slot.vertical ? { x: c.x, z: c.z + d } : { x: c.x + d, z: c.z };
  });
}

/** Rails span the whole slot: centre, length and direction. */
export function fenceSpan(slot: Slot) {
  return { ...toWorld(slot.x, slot.y), length: L.fence.length * D.unit, vertical: slot.vertical };
}

/** Brick i of the house: layers of columns × rows, bottom up, capped at maxLayers (the label still shows the real count). */
export function brickCells(count: number) {
  const h = D.house, perLayer = h.columns * h.rows;
  const shown = Math.max(0, Math.min(Math.floor(count), perLayer * h.maxLayers));
  const house = rectBox(L.house);
  const [bw, bh, bd] = h.brick;
  const x0 = house.x - ((h.columns - 1) * (bw + h.gap)) / 2, z0 = house.z - ((h.rows - 1) * (bd + h.gap)) / 2;
  return Array.from({ length: shown }, (_, i) => {
    const layer = Math.floor(i / perLayer), k = i % perLayer;
    return { x: x0 + (k % h.columns) * (bw + h.gap), y: h.slab + bh / 2 + layer * (bh + 0.02), z: z0 + Math.floor(k / h.columns) * (bd + h.gap), layer };
  });
}

/** Left-side slots (facing the Mac) that have no fence segment yet get a hedge: same rule as the 2D yard. */
export function hedgeSlots(segmentCount: number) {
  return L.slots.map((slot, index) => ({ slot, index })).filter(({ slot, index }) => slot.vertical && slot.x < L.width / 2 && index >= segmentCount);
}

/** Decor frames from the 2D Kenney layout, re-read as 3D props. */
export function decorKind(frame: number): 'tree' | 'autumn' | 'bush' | 'mushroom' | 'hive' | 'sprout' {
  if (frame === 15) return 'autumn';
  if (frame === 5) return 'bush';
  if (frame === 29) return 'mushroom';
  if (frame === 94) return 'hive';
  if (frame === 17) return 'sprout';
  return 'tree';
}

/** Does the segment a→b cross the rectangle (centre x/z, half sizes)? Slab test. */
function crosses(a: XZ, b: XZ, r: { x: number; z: number; hx: number; hz: number }) {
  let t0 = 0, t1 = 1;
  const d = { x: b.x - a.x, z: b.z - a.z };
  for (const [p, dp, lo, hi] of [[a.x, d.x, r.x - r.hx, r.x + r.hx], [a.z, d.z, r.z - r.hz, r.z + r.hz]] as const) {
    if (Math.abs(dp) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let u0 = (lo - p) / dp, u1 = (hi - p) / dp;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}

const dist = (a: XZ, b: XZ) => Math.hypot(a.x - b.x, a.z - b.z);

/** Walking route from a to b that goes around the house (never through it): 0, 1 or 2 corner waypoints. */
export function route(a: XZ, b: XZ, margin = 1): XZ[] {
  const h = rectBox(L.house);
  const r = { x: h.x, z: h.z, hx: h.width / 2 + margin, hz: h.depth / 2 + margin };
  if (!crosses(a, b, { ...r, hx: r.hx - 0.05, hz: r.hz - 0.05 })) return [b];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({ x: r.x + sx * (r.hx + 0.05), z: r.z + sz * (r.hz + 0.05) }));
  const inner = { ...r, hx: r.hx - 0.1, hz: r.hz - 0.1 };
  let best: XZ[] = [], bestLength = Infinity;
  for (const c of corners) {
    if (!crosses(a, c, inner) && !crosses(c, b, inner) && dist(a, c) + dist(c, b) < bestLength) { best = [c, b]; bestLength = dist(a, c) + dist(c, b); }
    for (const d of corners) {
      if (d === c || crosses(a, c, inner) || crosses(c, d, inner) || crosses(d, b, inner)) continue;
      const length = dist(a, c) + dist(c, d) + dist(d, b);
      if (length < bestLength) { best = [c, d, b]; bestLength = length; }
    }
  }
  return best.length ? best : [b];
}

/** How far the project house is built for a brick count (pure; every brick moves it forward, capped at complete). */
export function houseStage(bricks: number) {
  const n = Math.max(0, Math.floor(bricks)), H = D.house;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    courses: Math.min(H.courses, n),                                 // wall courses laid (1 per brick)
    door: n > H.courses,                                             // brick 9
    windows: n > H.courses + 1,                                      // brick 10
    roof: clamp((n - H.courses - 2) / H.roofBricks),                 // bricks 11..18
    chimney: n >= H.courses + 2 + H.roofBricks + 1,                  // brick 19
    flowers: n >= H.courses + 2 + H.roofBricks + 3,                  // brick 21
    lamp: n >= H.courses + 2 + H.roofBricks + 4,                     // brick 22
    lit: n >= H.courses + 2 + H.roofBricks + 6,                      // brick 24: the house is complete
  };
}

/** Where brick number `bricks` lands on the house (the side cycles front, right, back, left) and where the
 *  builder stands outside that wall, facing it. Shared by the house (landing brick) and the Agent (work spot). */
export function houseWork(bricks: number) {
  const r = rectBox(L.house), t = D.house.wall, k = ((Math.floor(bricks) % 4) + 4) % 4;
  const sides = [
    { x: r.x - r.width * 0.2, z: r.z + r.depth / 2 - t / 2, nx: 0, nz: 1 },
    { x: r.x + r.width / 2 - t / 2, z: r.z + r.depth * 0.15, nx: 1, nz: 0 },
    { x: r.x + r.width * 0.2, z: r.z - r.depth / 2 + t / 2, nx: 0, nz: -1 },
    { x: r.x - r.width / 2 + t / 2, z: r.z - r.depth * 0.15, nx: -1, nz: 0 },
  ];
  const s = sides[k], out = t / 2 + D.house.standOff;
  return { landing: { x: s.x, z: s.z }, stand: { x: s.x + s.nx * out, z: s.z + s.nz * out }, face: Math.atan2(-s.nx, -s.nz) };
}
