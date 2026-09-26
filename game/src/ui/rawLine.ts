/** reduce() stores raw lines as "[channel] text"; split them back for coloring. */
export function splitRawLine(line: string): { channel: string; text: string } {
  const match = /^\[([a-z-]+)\] ([\s\S]*)$/.exec(line);
  return match ? { channel: match[1], text: match[2] } : { channel: 'other', text: line };
}
