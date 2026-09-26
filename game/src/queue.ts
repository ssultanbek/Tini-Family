import type { Actor, EngineEvent } from '../../shared/events.ts';

export type AnimatedActor = Exclude<Actor, 'system'>;
export type AnimationOptions = { signal: AbortSignal; speed: 'normal' | 'fast' | 'instant' };
type Animation = (event: EngineEvent, options: AnimationOptions) => Promise<void>;
const actors: AnimatedActor[] = ['tini', 'tina', 'dog'];
export const MAX_ANIMATION_LAG = 1600;

/** Decoration only: the reducer and controls never wait on these queues. */
export function createAnimationQueues() {
  const pending = { tini: [], tina: [], dog: [] } as Record<AnimatedActor, { event: EngineEvent; at: number }[]>;
  const active = new Map<AnimatedActor, AbortController>();
  let animation: Animation | undefined;
  let generation = 0;
  async function drain(actor: AnimatedActor) {
    if (active.has(actor) || !animation) return;
    const run = generation;
    const controller = new AbortController();
    active.set(actor, controller);
    try {
      while (pending[actor].length && run === generation) {
        const waiting = pending[actor].length;
        const { event, at } = pending[actor].shift()!;
        const age = performance.now() - at;
        const job = new AbortController();
        const cancel = () => job.abort('clear');
        controller.signal.addEventListener('abort', cancel, { once: true });
        const deadline = setTimeout(() => job.abort('catch-up'), Math.max(0, MAX_ANIMATION_LAG - age));
        try {
          await animation(event, { signal: job.signal, speed: waiting > 5 || age > 900 ? 'instant' : waiting > 2 || age > 350 ? 'fast' : 'normal' });
        } finally {
          clearTimeout(deadline);
          controller.signal.removeEventListener('abort', cancel);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) console.error('Animation failed', error);
    } finally {
      if (run === generation) { active.delete(actor); if (pending[actor].length) void drain(actor); }
    }
  }
  function clear() {
    generation++;
    for (const controller of active.values()) controller.abort();
    active.clear();
    for (const actor of actors) pending[actor] = [];
  }
  return {
    clear,
    attach(handler: Animation) {
      clear(); animation = handler;
      return () => { if (animation === handler) { clear(); animation = undefined; } };
    },
    enqueue(event: EngineEvent) {
      if (event.actor === 'system' || !animation) return;
      pending[event.actor].push({ event, at: performance.now() });
      void drain(event.actor);
    },
  };
}
export const animationQueues = createAnimationQueues();
