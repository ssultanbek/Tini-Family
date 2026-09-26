/** Kenney CC0 tilesheets (16px tiles, packed, 12 columns) and the frame picked for each part of the yard. */
export const sheets = {
  town: '/assets/tiny-town/Tilemap/tilemap_packed.png',
  dungeon: '/assets/tiny-dungeon/Tilemap/tilemap_packed.png',
  tile: 16,
} as const;

export const frames = {
  grass: 0, grassTuft: 1, grassFlowers: 2, dirt: 25,
  // Horizontal runs alternate plain rails (81) with post rails (45) so they read as real fences.
  fence: { left: 80, middle: 81, post: 45, right: 82, top: 47, vertical: 59, bottom: 71 },
  // The project's house: an empty stone footprint that fills with roof tiles, one per brick.
  floor: 109, roofTop: [52, 53, 53, 54], roofRow: [64, 65, 65, 66],
  tini: 85, tina: 99,
} as const;

/** Status look for pixel fences: a soft colored glow under the planks plus a tint. Labels still carry the words. */
export const fenceLook = {
  planned: { glow: 0, tint: 0xffffff, alpha: 0.35 },
  built: { glow: 0, tint: 0xffffff, alpha: 1 },
  inspecting: { glow: 0xffd84a, tint: 0xfff0b0, alpha: 1 },
  red: { glow: 0xff4d3d, tint: 0xffb0a6, alpha: 1 },
  green: { glow: 0x4fd26f, tint: 0xc9ffd2, alpha: 1 },
} as const;
