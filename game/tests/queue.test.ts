import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAnimationQueues, MAX_ANIMATION_LAG } from '../src/queue.ts';
import type { EngineEvent } from '../../shared/events.ts';
const event = (seq: number, actor: 'tini' | 'tina' | 'dog' = 'tini'): EngineEvent => ({ seq, actor, ts: 0, type: 'speech', text: String(seq) });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('actors run independently, preserve order, and compress a burst', async () => {
  const q = createAnimationQueues();
  const calls: { seq: number; speed: string }[] = [];
  const release: (() => void)[] = [];
  const detach = q.attach(async (e, options) => {
    calls.push({ seq: e.seq, speed: options.speed });
    if (e.seq === 1 || e.seq === 20) await new Promise<void>(resolve => release.push(resolve));
  });
  q.enqueue(event(1));
  for (let seq = 2; seq <= 9; seq++) q.enqueue(event(seq));
  q.enqueue(event(20, 'dog'));
  assert.deepEqual(calls.map(call => call.seq), [1, 20]);
  release.forEach(fn => fn()); await tick();
  assert.deepEqual(calls.map(call => call.seq), [1, 20, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(calls[2].speed, 'instant');
  assert.ok(calls.some(call => call.speed === 'fast'));
  assert.equal(calls.at(-1)?.speed, 'normal');
  detach();
});

test('deadline finishes slow decoration within the lag budget without discarding the next event', async () => {
  const q = createAnimationQueues();
  const seen: number[] = [];
  const started = performance.now();
  let reason: unknown;
  const detach = q.attach(async (e, options) => {
    seen.push(e.seq);
    if (e.seq === 1) await new Promise<void>(resolve => options.signal.addEventListener('abort', () => { reason = options.signal.reason; resolve(); }, { once: true }));
  });
  q.enqueue(event(1)); q.enqueue(event(2));
  await new Promise(resolve => setTimeout(resolve, MAX_ANIMATION_LAG + 60));
  assert.equal(reason, 'catch-up');
  assert.deepEqual(seen, [1, 2]);
  assert.ok(performance.now() - started < 2000);
  detach();
});

test('reset cancels active and pending work; an obsolete detach cannot clear a new scene', async () => {
  const q = createAnimationQueues();
  let aborted: unknown;
  const seen: number[] = [];
  const oldDetach = q.attach(async (e, options) => {
    seen.push(e.seq);
    await new Promise<void>(resolve => options.signal.addEventListener('abort', () => { aborted = options.signal.reason; resolve(); }, { once: true }));
  });
  q.enqueue(event(1)); q.enqueue(event(2));
  const detach = q.attach(async e => { seen.push(e.seq); });
  oldDetach(); q.enqueue(event(3)); await tick();
  assert.equal(aborted, 'clear');
  assert.deepEqual(seen, [1, 3]);
  detach();
});
