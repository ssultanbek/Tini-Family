import type { AnimatedActor } from './queue.ts';
export type Bubble = { actor: AnimatedActor; text: string; x: number; y: number };
let bubbles: Bubble[] = [];
const listeners = new Set<() => void>();
/** Transient visual positions/text only; never WorldState or gameplay facts. */
export const familyPresentation = {
  getSnapshot: () => bubbles,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  set(next: Bubble[]) { bubbles = next; listeners.forEach(listener => listener()); },
};
