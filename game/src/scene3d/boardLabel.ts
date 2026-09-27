/** CSS width of the board lettering (.d3-board); the Html scale is derived from it so text always fits the plank. */
export const BOARD_PX = 200;

/** Largest single- or two-line setting of a label that fits the plank's text area (no clipping, no "…"). */
export function fitBoardLabel(label: string) {
  const width = BOARD_PX - 12 - 40 - 7, height = 60, charW = 0.56, lineH = 1.05, max = 31;
  const words = label.trim().split(/\s+/);
  const one = { lines: [label.trim()], size: Math.min(max, width / (label.length * charW), height / lineH) };
  let best = one;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    const size = Math.min(max, width / (Math.max(...lines.map(l => l.length)) * charW), height / (2 * lineH));
    if (size > best.size) best = { lines, size };
  }
  return { lines: best.lines, size: Math.floor(best.size) };
}
