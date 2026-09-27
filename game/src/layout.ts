/** Every yard coordinate, size and placement lives here. Array order is arrival order. */
export const yardLayout = {
  width: 1100, height: 880,
  ground: { x: 280, y: 200, width: 540, height: 490 },
  outside: { x: 550, y: 20 }, yardLabel: { x: 550, y: 258 },
  gate: { x: 410, y: 690, width: 116, height: 30, labelY: 744 },
  path: { x: 386, y: 510, width: 48, height: 350 },
  house: { x: 438, y: 367, width: 224, height: 168, labelY: 310, countY: 572,
    columns: 4, rows: 3, maxRows: 8, gap: 5, brickWidth: 51, brickHeight: 50, inset: 5,
    roofInset: 8, roofLineGap: 22, roofLineWidth: 3 },
  slots: [
    { x: 410, y: 200, vertical: false, labelX: 410, labelY: 105 },
    { x: 690, y: 200, vertical: false, labelX: 690, labelY: 105 },
    { x: 820, y: 326, vertical: true, labelX: 965, labelY: 326 },
    { x: 820, y: 568, vertical: true, labelX: 965, labelY: 568 },
    { x: 690, y: 690, vertical: false, labelX: 690, labelY: 780 },
    { x: 280, y: 568, vertical: true, labelX: 135, labelY: 568 },
    { x: 280, y: 326, vertical: true, labelX: 135, labelY: 326 },
  ],
  fence: { length: 240, tileScale: 3, glowPad: 10, thickness: 24, postWidth: 12, postHeight: 40, postStep: 28,
    dash: 16, dashGap: 10, stroke: 3, railGap: 6, nailSize: 3, shake: 2 },
  sign: { width: 268, height: 130, padding: 12, lineGap: 4, shadow: 4 },
  grass: { step: 44, blade: 4, offset: 14 },
  tileScale: 3,
  // "Your Mac" house: a strip added left of the old canvas (world x < 0), so every yard position stays put.
  mac: { strip: 290, x: -272, width: 252, titleY: 122, titleHeight: 82, roomsY: 180, roomHeight: 128, roomGap: 12,
    tile: 36, icon: 50, iconX: 42, labelX: 78, labelY: -17, lockY: 21, outline: 6,
    titleSize: 32, subtitleSize: 20, labelSize: 25, lockSize: 20,
    flashMs: 1800, dot: { step: 16, radius: 4 } },
  hedge: { step: 30, size: 44, jitter: 6 },
  // Decorative Kenney props outside the fence; kept clear of every sign, label and the path.
  decor: [
    { frame: 16, x: 40, y: 70 }, { frame: 28, x: 110, y: 40 }, { frame: 5, x: 190, y: 110 }, { frame: 28, x: 60, y: 170 },
    { frame: 15, x: 1060, y: 60 }, { frame: 16, x: 990, y: 120 }, { frame: 28, x: 900, y: 50 }, { frame: 29, x: 1060, y: 190 },
    { frame: 5, x: 60, y: 450 }, { frame: 17, x: 200, y: 460 }, { frame: 94, x: 1050, y: 450 }, { frame: 5, x: 900, y: 460 },
    { frame: 16, x: 50, y: 720 }, { frame: 16, x: 130, y: 800 }, { frame: 28, x: 230, y: 740 }, { frame: 29, x: 300, y: 830 },
    { frame: 15, x: 1060, y: 720 }, { frame: 16, x: 980, y: 810 }, { frame: 5, x: 880, y: 760 }, { frame: 17, x: 520, y: 830 },
  ],
  type: { small: 23, label: 27, heading: 30, minFit: 17, font: '"Instrument Sans Variable", system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
    load: ['400 23px "Instrument Sans Variable"', '700 27px "Instrument Sans Variable"'] },
};
/** The Phaser canvas: the old yard plus the Mac strip on its left. */
export const canvasWidth = yardLayout.width + yardLayout.mac.strip;

export const dashboardLayout = {
  '--page-width': '1440px', '--page-padding': '24px', '--gap': '20px',
  '--card-padding': '24px', '--radius': '14px', '--body-size': '18px',
  '--title-size': '32px', '--heading-size': '23px', '--stat-size': '28px',
  '--log-height': '480px', '--raw-height': '320px', '--input-height': '130px',
  '--toast-width': '430px', '--toast-height': '48vh', '--control-height': '46px',
};
export const gameLayout = {
  ...dashboardLayout, '--page-width': '1800px', '--page-padding': '20px',
  '--card-padding': '20px', '--gap': '16px', '--yard-controls-width': '390px',
  '--yard-min-width': '660px', '--yard-top': '16px', '--yard-aspect': `${canvasWidth} / ${yardLayout.height}`,
};

export const familyLayout = {
  homes: { tini: { x: 355, y: 610 }, tina: { x: 760, y: 318 }, dog: { x: 730, y: 445 } },
  zones: { gate: { x: 410, y: 630 }, yard: { x: 550, y: 625 }, house: { x: 730, y: 445 }, outside: { x: 410, y: 820 } },
  approach: 66, bumpApproach: 26,
  body: { width: 44, height: 34, radius: 12, headY: -17, headRadius: 17, shadowY: 18, shadowWidth: 52, shadowHeight: 19,
    eyeX: 6, eyeY: -20, eyeRadius: 3, noseY: -11, noseRadius: 4, earX: 19, earY: -19, earWidth: 13, earHeight: 28,
    footX: 12, footY: 19, footWidth: 12, footHeight: 13, hatY: -32, hatWidth: 40, hatHeight: 9, bowX: 17, bowY: -30, bowRadius: 8 },
  sprite: { scale: 4, y: -6 },
  walk: { pixelsPerMs: 0.42, minMs: 180, maxMs: 900, stepMs: 150, hop: 7, sway: 4, minDistance: 3 },
  nameY: 47, stateY: 78, nameSize: 27, stateSize: 24, labelPadding: 4,
  box: { x: 0, y: 9, width: 76, height: 40, textSize: 20, tapeWidth: 7 },
  inspection: { x: 30, y: -12, radius: 15, handle: 17, stroke: 5 },
  spark: { count: 8, distance: 39, radius: 5, stroke: 3 },
  brick: { x: -34, y: -22, width: 28, height: 18, rise: 25 },
  // Characters above flipY speak downward (bubble under them), so bubbles never cover the top signs.
  bubble: { width: 300, offsetY: 55, edge: 160, padding: 12, fontSize: 18, flipY: 520, belowOffset: 100, insideHalf: 165 },
  speech: { baseMs: 1800, perCharMs: 50, minMs: 2600, maxMs: 7000, holdPerCharMs: 30, minHoldMs: 1100, maxHoldMs: 3000 },
  motion: { walk: 330, carryLeg: 300, look: 180, bump: 240, place: 160, fastFactor: 0.22 },
};

/** Unknown/pre-plan segments use the gate; no invented segment identity or facts. */
export function segmentPosition(index: number, distance = familyLayout.approach) {
  const slot = yardLayout.slots[index];
  if (!slot) return { x: yardLayout.gate.x, y: yardLayout.gate.y - distance };
  return { x: slot.x + (slot.vertical ? (slot.x < yardLayout.width / 2 ? distance : -distance) : 0),
    y: slot.y + (!slot.vertical ? (slot.y < yardLayout.height / 2 ? distance : -distance) : 0) };
}

/** Destination for the decorative brick, using the same roof grid as the yard. */
export function brickPosition(total: number) {
  const h = yardLayout.house;
  const index = Math.max(0, Math.min(h.columns * h.rows - 1, total - 1));
  return { x: h.x + h.inset + (index % h.columns) * (h.brickWidth + h.gap),
    y: h.y + h.inset + Math.floor(index / h.columns) * (h.brickHeight + h.gap) };
}
