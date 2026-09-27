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
