import type { SessionMode, WorldState } from '../../../shared/events.ts';

// v1.4 session.mode → badge. "Live" only when the engine says the run is live, never during a recording.
const labels: Record<SessionMode, string> = { live: 'Live', replay: 'Recorded run', observe: 'Observing', mock: 'Mock' };

export function modeBadge(world: WorldState, connected: boolean, synced: boolean): { text: string; tone: 'ok' | 'bad' | 'info' } {
  if (!connected) return { text: '○ Offline', tone: 'bad' };
  if (!synced) return { text: '● Syncing', tone: 'info' };
  return world.mode ? { text: `● ${labels[world.mode]}`, tone: world.mode === 'live' ? 'ok' : 'info' } : { text: '● Connected', tone: 'ok' };
}
