import type { EngineEvent, Finding, WorldState } from '../../../shared/events.ts';

export type FixedFinding = { finding: Finding; summary: string };

/**
 * Presentation only: a finding the engine reported fixed stays on screen (as "fixed")
 * until the engine turns its segment green, so the card can animate away at that moment.
 * Derived purely from received events and state; after a snapshot nothing lingers.
 */
export function fixedAwaitingGreen(world: WorldState, events: EngineEvent[]): FixedFinding[] {
  const reported = new Map<string, Finding>();
  const fixed: FixedFinding[] = [];
  for (const event of events) {
    if (event.type === 'segment.red') reported.set(event.finding.id, event.finding);
    if (event.type === 'fix.applied') {
      const finding = reported.get(event.findingId);
      if (finding) fixed.push({ finding, summary: event.summary });
    }
  }
  return fixed.filter(({ finding }) =>
    !world.findings.some(open => open.id === finding.id) &&
    world.segments.find(segment => segment.id === finding.segmentId)?.status !== 'green');
}
