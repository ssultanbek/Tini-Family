import type { EngineEvent, Finding, WorldState } from '../../../shared/events.ts';

export type FixedFinding = { finding: Finding; summary: string; how: 'fixed' | 'cleared' };

/**
 * Presentation only: a finding the engine reported fixed (fix.applied) or cleared on a rescan
 * (v1.3 finding.cleared) stays on screen until the engine turns its segment green, so the card can
 * animate away at that moment. Derived purely from received events and state; after a snapshot nothing lingers.
 */
export function fixedAwaitingGreen(world: WorldState, events: EngineEvent[]): FixedFinding[] {
  const reported = new Map<string, Finding>();
  const resolved = new Map<string, FixedFinding>(); // latest resolution per finding
  for (const event of events) {
    if (event.type === 'segment.red') { reported.set(event.finding.id, event.finding); resolved.delete(event.finding.id); }
    const finding = (event.type === 'fix.applied' || event.type === 'finding.cleared') && reported.get(event.findingId);
    if (event.type === 'fix.applied' && finding) resolved.set(finding.id, { finding, summary: event.summary, how: 'fixed' });
    if (event.type === 'finding.cleared' && finding) resolved.set(finding.id, { finding, summary: event.reason, how: 'cleared' });
  }
  return [...resolved.values()].filter(({ finding }) =>
    !world.findings.some(open => open.id === finding.id) &&
    world.segments.find(segment => segment.id === finding.segmentId)?.status !== 'green');
}
