/** Every yard coordinate, size and placement lives here. Array order is arrival order. */
export const yardLayout = {
  width: 1100, height: 880,
  ground: { x: 280, y: 200, width: 540, height: 490 },
  outside: { x: 550, y: 28 }, yardLabel: { x: 550, y: 258 },
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
  fence: { length: 224, thickness: 24, postWidth: 12, postHeight: 40, postStep: 28,
    dash: 16, dashGap: 10, stroke: 3, railGap: 6, nailSize: 3, shake: 2 },
  sign: { width: 254, height: 130, padding: 12, titleY: -47, detailY: -6, statusY: 43, shadow: 4 },
  grass: { step: 44, blade: 4, offset: 14 },
  type: { small: 21, label: 25, heading: 28, font: 'Arial, sans-serif' },
};
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
  '--yard-min-width': '660px', '--yard-top': '16px', '--yard-aspect': `${yardLayout.width} / ${yardLayout.height}`,
};

export const familyLayout = {
  homes: { tini: { x: 355, y: 610 }, tina: { x: 735, y: 350 }, dog: { x: 730, y: 445 } },
  zones: { gate: { x: 410, y: 630 }, yard: { x: 550, y: 625 }, house: { x: 730, y: 445 }, outside: { x: 410, y: 820 } },
  approach: 66, bumpApproach: 26,
  body: { width: 44, height: 34, radius: 12, headY: -17, headRadius: 17, shadowY: 18, shadowWidth: 52, shadowHeight: 19,
    eyeX: 6, eyeY: -20, eyeRadius: 3, noseY: -11, noseRadius: 4, earX: 19, earY: -19, earWidth: 13, earHeight: 28,
    footX: 12, footY: 19, footWidth: 12, footHeight: 13, hatY: -32, hatWidth: 40, hatHeight: 9, bowX: 17, bowY: -30, bowRadius: 8 },
  nameY: 47, stateY: 76, nameSize: 25, stateSize: 23, labelPadding: 4,
  box: { x: 0, y: 9, width: 76, height: 40, textSize: 20, tapeWidth: 7 },
  inspection: { x: 30, y: -12, radius: 15, handle: 17, stroke: 5 },
  spark: { count: 8, distance: 39, radius: 5, stroke: 3 },
  brick: { x: -34, y: -22, width: 28, height: 18, rise: 25 },
  bubble: { width: 300, offsetY: 55, edge: 160, padding: 12, fontSize: 18 },
  motion: { walk: 330, carryLeg: 300, look: 180, bump: 240, place: 160, fastFactor: 0.22, speech: 2600 },
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
