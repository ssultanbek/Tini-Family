// Plain-English words for a finding. AI ladder task "tina.explain", one call per finding
// TYPE per process (and cached on disk by the ladder). The AI only sees the type, a file
// name and a REDACTED snippet. Every type has a template fallback, and AI words are
// checked before use (length, no key-looking strings).
import path from "node:path";
import { z } from "zod";
import type { Ask } from "../ai.ts";
import type { FindingType, RawFinding } from "./scan.ts";

export interface Words { title: string; explanation: string }

export const TEMPLATES: Record<FindingType, Words> = {
  "api-key": {
    title: "API key in your website's code",
    explanation: "Anyone who visits the site can copy this key straight from the page. They could use it to run up charges on the account it belongs to.",
  },
  "photo-metadata": {
    title: "A photo still says who took it",
    explanation: "This photo carries hidden details like the camera owner's name or the camera's serial number. Anyone who downloads it from the site can read them.",
  },
  "personal-data": {
    title: "Private information in a published file",
    explanation: "This file contains something private, like an ID number or a password. Anyone who visits the site could read it.",
  },
  "risky-file": {
    title: "A private-looking file is in the output",
    explanation: "This file's name suggests it holds private information. It would be published along with everything else.",
  },
};

export const ExplainSchema = z.object({
  title: z.string().describe("short plain-English headline, max 8 words, no file names"),
  sentences: z.array(z.string()).describe("exactly two short plain sentences for a non-technical owner: what the problem is, and why it matters"),
});

const INSTRUCTIONS = `You are Tina, who checks a website before it is published, for a non-technical owner.
You get a type of problem Tina found, one example file name and a redacted snippet (values are hidden).
Write a short headline (max 8 words) and exactly two plain sentences, each under 20 words: what the
problem is, and the one concrete way it could hurt the owner. Calm and factual, no scare words, no jargon,
no file names, no code, no advice about how to fix it. Reply with JSON only.`;

const KEYISH = /AIza|sk_live|sk_test|AKIA|ghp_|xox[abprs]-|•/;

function valid(w: z.infer<typeof ExplainSchema>): Words | null {
  const title = w.title.replace(/\s+/g, " ").trim().replace(/[.!]$/, "");
  const sentences = w.sentences.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!title || title.length > 70 || title.split(" ").length > 10) return null;
  if (sentences.length !== 2 || sentences.some((s) => s.length > 160)) return null;
  const explanation = sentences.map((s) => (/[.!?]$/.test(s) ? s : s + ".")).join(" ");
  if (KEYISH.test(title + explanation)) return null;
  return { title, explanation };
}

const memo = new Map<FindingType, Promise<Words & { source: string }>>();

/** Words for this finding's type (first finding of a type sets them for the process). */
export function explain(ai: Ask, f: RawFinding): Promise<Words & { source: string }> {
  const hit = memo.get(f.type);
  if (hit) return hit;
  const p = (async () => {
    const res = await ai({
      task: "tina.explain",
      instructions: INSTRUCTIONS,
      input: { type: f.type, what: f.detail, file: path.basename(f.file), redactedSnippet: f.snippet },
      schema: ExplainSchema,
      fallback: { title: TEMPLATES[f.type].title, sentences: [] },
      cache: process.env.TINI_AI_CACHE !== "off",
    });
    const w = res.source === "fallback" ? null : valid(res.value);
    return w ? { ...w, source: res.source } : { ...TEMPLATES[f.type], source: "template" };
  })();
  memo.set(f.type, p);
  p.catch(() => memo.delete(f.type));
  return p;
}

/** Forget memoized words (tests; a new project). */
export function resetExplanations(): void { memo.clear(); }
