import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { EngineEvent, WorldState } from '../../shared/events.ts';
import { initialState, reduce } from '../../shared/reducer.ts';
import { createStore } from '../src/store.ts';
import { createAnimationQueues } from '../src/queue.ts';

const recorded = readFileSync(new URL('../../mock/recordings/sample-mock-run.jsonl', import.meta.url), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(line => line.kind === 'event').map(line => line.event as EngineEvent);

test('recorded story folds into the actual store; every intermediate snapshot resumes correctly', () => {
  const store = createStore();
  let reference = initialState();
  for (const event of recorded) {
    reference = reduce(reference, event);
    assert.equal(store.event(event), true);
    assert.deepEqual(store.getSnapshot().world, reference);
    const reloaded = createStore();
    reloaded.snapshot(structuredClone(reference));
    assert.deepEqual(reloaded.getSnapshot().world, reference);
    assert.equal(reloaded.getSnapshot().events.length, 0);
    if (event.type !== 'session.reset') assert.equal(reloaded.event(event), false);
  }
  const final = store.getSnapshot().world;
  // The recorded project: launch after turn 1, then two follow-up prompts (turn 2 names a new folder).
  assert.equal(final.phase, 'ready');
  assert.deepEqual(final.turns.map(turn => turn.id), [1, 2, 3]);
  assert.ok(final.turns.every(turn => turn.summary));
  assert.equal(final.bricks, 16);
  assert.equal(final.blocked.length, 2);
  assert.equal(final.findings.length, 0);
  assert.equal(final.segments.length, 7);
  assert.ok(final.segments.every(segment => segment.status === 'green'));
  assert.ok(final.report && final.launchUnlocked);
});

test('old events are ignored, but a lower-sequence reset always clears world and decoration', () => {
  const store = createStore();
  store.snapshot({ ...initialState(), seq: 100, bricks: 9 });
  assert.equal(store.event({ actor: 'dog', type: 'dog.brick.placed', op: 'write', file: 'old', bricks: 1, seq: 90, ts: 0 }), false);
  store.sent({ type: 'launch' });
  store.event({ actor: 'tini', type: 'speech', text: 'hello', seq: 101, ts: 0 });
  assert.equal(store.event({ actor: 'system', type: 'session.reset', seq: 1, ts: 0 }), true);
  assert.deepEqual(store.getSnapshot().world, { ...initialState(), seq: 1 });
  assert.deepEqual(store.getSnapshot().speech, {});
  assert.deepEqual(store.getSnapshot().pending, []);
  assert.equal(store.getSnapshot().events.length, 1);
});

test('state updates before animation; system events bypass queues and snapshot cancels running work', async () => {
  const queues = createAnimationQueues();
  const store = createStore(queues);
  let signal: AbortSignal | undefined;
  let calls = 0;
  queues.attach(async (event, options) => {
    calls++;
    assert.equal(store.getSnapshot().world.seq, event.seq);
    signal = options.signal;
    await new Promise<void>(resolve => options.signal.addEventListener('abort', () => resolve(), { once: true }));
  });
  store.event({ actor: 'dog', type: 'dog.state', state: 'working', seq: 1, ts: 0 });
  store.event({ actor: 'system', type: 'launch.unlocked', seq: 2, ts: 0 });
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot().world.launchUnlocked, true);
  store.snapshot(initialState());
  assert.equal(signal?.aborted, true);
  await Promise.resolve();
});

test('finding clicks stay pending until engine acknowledgement; Adjust never fakes a result', () => {
  const store = createStore();
  store.sent({ type: 'fix.apply', findingId: 'f-key', fixId: 'move-key-to-env' });
  store.sent({ type: 'fix.apply', findingId: 'f-face', fixId: 'blur' });
  store.event({ actor: 'tina', type: 'fix.applied', findingId: 'f-face', fixId: 'blur', summary: 'fixed', seq: 1, ts: 0 });
  assert.deepEqual(store.getSnapshot().pending, ['fix:f-key']);
  const before: WorldState = store.getSnapshot().world;
  store.sent({ type: 'adjust.plan', text: 'Please adjust' });
  assert.equal(store.getSnapshot().world, before);
  store.connection(false);
  assert.equal(store.getSnapshot().synced, false);
});

test('a follow-up prompt stays pending until the engine starts the turn, which also drops an unanswered Launch', () => {
  const store = createStore();
  store.snapshot({ ...initialState(), seq: 10, phase: 'ready', launchUnlocked: true });
  store.sent({ type: 'launch' });
  store.sent({ type: 'prompt', text: 'Make the header darker' });
  assert.deepEqual(store.getSnapshot().pending, ['launch', 'prompt']);
  store.event({ actor: 'system', type: 'turn.started', turnId: 2, prompt: 'Make the header darker', seq: 11, ts: 0 });
  store.event({ actor: 'system', type: 'launch.locked', reason: 'New work since the last inspection', seq: 12, ts: 0 });
  assert.deepEqual(store.getSnapshot().pending, []);
  assert.equal(store.getSnapshot().world.launchUnlocked, false);
  assert.deepEqual(store.getSnapshot().world.turns, [{ id: 2, prompt: 'Make the header darker' }]);
});
