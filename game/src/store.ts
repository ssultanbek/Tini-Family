import type { Actor, EngineEvent, GameCommand, WorldState } from '../../shared/events.ts';
import { initialState, reduce } from '../../shared/reducer.ts';
import { animationQueues } from './queue.ts';

export function commandKey(command: GameCommand): string {
  if (command.type === 'fix.apply') return `fix:${command.findingId}`;
  if (command.type === 'escalation.choose') return `escalation:${command.escalationId}`;
  return command.type;
}

/** World facts are exclusively replaced by snapshots or folded through reduce(). */
export function createStore(queues = animationQueues) {
  let current = {
    world: initialState(), connected: false, synced: false, connectionError: '',
    events: [] as EngineEvent[], speech: {} as Partial<Record<Actor, string>>,
    pending: [] as string[], engineError: '', snapshotSeq: null as number | null,
    epoch: 0,
  };
  let lastSeq = 0;
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connection(connected: boolean, error = '') {
      current = { ...current, connected, synced: false, connectionError: error, pending: [] };
      publish();
    },
    snapshot(world: WorldState) {
      queues.clear(); lastSeq = world.seq;
      current = { ...current, world, synced: true, events: [], speech: {}, pending: [], engineError: '', snapshotSeq: world.seq, epoch: current.epoch + 1 };
      publish();
    },
    event(event: EngineEvent) {
      if (event.type !== 'session.reset' && event.seq <= lastSeq) return false;
      const reset = event.type === 'session.reset';
      if (reset) queues.clear();
      lastSeq = event.seq;
      let pending = reset ? [] : current.pending;
      const acknowledged: string[] = [];
      if (event.type === 'user.prompt' || event.type === 'turn.started') acknowledged.push('start', 'prompt');
      // A new turn starts new work; an earlier Launch click the engine never answered is dropped.
      if (event.type === 'turn.started') acknowledged.push('launch');
      if (event.type === 'fence.plan.approved') acknowledged.push('approve.plan');
      if (event.type === 'fence.plan.proposed') acknowledged.push('adjust.plan');
      if (event.type === 'escalation.resolved') acknowledged.push(`escalation:${event.escalationId}`);
      if (event.type === 'fix.applied') acknowledged.push(`fix:${event.findingId}`);
      if (event.type === 'launch.done') acknowledged.push('launch');
      pending = event.type === 'engine.error' ? [] : pending.filter(key => !acknowledged.includes(key));
      current = {
        ...current, world: reduce(current.world, event), pending,
        events: reset ? [event] : [...current.events, event],
        speech: reset ? {} : event.type === 'speech' ? { ...current.speech, [event.actor]: event.text } : current.speech,
        engineError: reset ? '' : event.type === 'engine.error' ? event.message : current.engineError,
        epoch: current.epoch + (reset ? 1 : 0), snapshotSeq: reset ? null : current.snapshotSeq,
      };
      publish();
      if (!reset && event.actor !== 'system') queues.enqueue(event);
      return true;
    },
    sent(command: GameCommand) {
      if (command.type === 'adjust.plan') return; // Mock has no adjustment acknowledgement or gate.
      current = { ...current, pending: [...current.pending, commandKey(command)] };
      publish();
    },
  };
}
export const store = createStore();
