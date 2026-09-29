import type { GameCommand, Phase } from '../../../shared/events.ts';

/** Which command the prompt bar sends in each phase: none while the crew works. */
export function promptCommand(phase: Phase, text: string): GameCommand | null {
  if (phase === 'idle') return { type: 'start', prompt: text };
  if (phase === 'ready' || phase === 'launched') return { type: 'prompt', text };
  return null;
}

/** The report pops up by itself only right after a launch; a new turn tucks it away. */
export type ReportMode = 'auto' | 'open' | 'closed';
export function reportVisible(mode: ReportMode, phase: Phase, hasReport: boolean): boolean {
  return hasReport && (mode === 'open' || (mode === 'auto' && phase === 'launched'));
}
