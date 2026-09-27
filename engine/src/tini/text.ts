// Display text helpers: everything the owner reads is cut at a word boundary, never mid-word.

/** Collapses whitespace and, if longer than maxChars, cuts at the last whole word and adds "…". */
export function clip(s: string, maxChars: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).replace(/[\s,;:.(\-–—/]+$/, "") + "…";
}

export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** The first maxWords words, whole (no "…": for labels painted on the fence). */
export function firstWords(s: string, maxWords: number): string {
  return s.replace(/\s+/g, " ").trim().split(" ").slice(0, maxWords).join(" ");
}
