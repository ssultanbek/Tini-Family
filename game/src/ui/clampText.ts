/** Long turn summaries show this many characters, then "… more" to expand. */
export const SUMMARY_PREVIEW = 160;

/** The collapsed form of `text`: cut at a word boundary with "…", or null if it already fits. */
export function clampText(text: string, max = SUMMARY_PREVIEW): string | null {
  if (text.length <= max) return null;
  const cut = text.slice(0, max - 1);
  return (cut.replace(/\s+\S*$/, '') || cut).trimEnd() + '…';
}
