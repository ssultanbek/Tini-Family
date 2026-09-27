// The 3D family never teleports: events go through the real per-actor queue (which aborts slow
// animations after ~1.6s) while frames advance at 60fps; every body moves at most one frame's step.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { createServer } from 'vite';
import type { EngineEvent } from '../../shared/events.ts';

const recorded = readFileSync(new URL('../../mock/recordings/demo-main.jsonl', import.meta.url), 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(l => l.kind === 'event').map(l => l.event as EngineEvent);
const vite = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
after(() => vite.close());

test('characters walk continuously and actions play, even when the queue hurries or aborts', async () => {
  const F = await vite.ssrLoadModule('/src/scene3d/Family3D.tsx') as typeof import('../src/scene3d/Family3D.tsx');
  const { createAnimationQueues } = await vite.ssrLoadModule('/src/queue.ts') as typeof import('../src/queue.ts');
  const { store } = await vite.ssrLoadModule('/src/store.ts') as typeof import('../src/store.ts');
  const { diorama: D } = await vite.ssrLoadModule('/src/layout.ts') as typeof import('../src/layout.ts');
  const mk = (x: number, z: number): import('../src/scene3d/Family3D.tsx').Body => ({ pos: { x, z }, yaw: 0, path: [], speed: 3, moving: false, walkPhase: 0 });
  const bodies = { tini: mk(-2, 6), tina: mk(8, -2), dog: mk(8, 0) };
  const queues = createAnimationQueues();
  queues.attach((event, options) => F.animate(bodies, event, options));
  const actions = new Set<string>();
  let maxJump = 0, walked = 0;
  const frame = 1 / 60;
  const tick = () => {
    for (const [kind, b] of Object.entries(bodies)) {
      const before = { ...b.pos };
      F.advance(b, frame, kind === 'dog' ? 5.5 : 4.2);
      const jump = Math.hypot(b.pos.x - before.x, b.pos.z - before.z);
      maxJump = Math.max(maxJump, jump); walked += jump;
      if (b.action) actions.add(`${kind}:${b.action.name}`);
    }
  };
  // Feed the recording fast (bursts, like a replay at speed) while frames keep running in real time.
  store.connection(true);
  const timer = setInterval(tick, 1000 / 60);
  try {
    for (const event of recorded.slice(0, 120)) {
      store.event(event);
      if (event.actor !== 'system') queues.enqueue(event);
      await new Promise(r => setTimeout(r, 25));
    }
    await new Promise(r => setTimeout(r, 2500));
  } finally { clearInterval(timer); queues.clear(); }
  assert.ok(maxJump <= D.motion.maxSpeed * frame + 0.03, `no teleport: largest single-frame move ${maxJump.toFixed(3)}`);
  assert.ok(walked > 20, `characters actually walked (${walked.toFixed(1)} units)`);
  for (const a of ['tini:hammer', 'tina:scan']) assert.ok(actions.has(a), `${a} played (saw ${[...actions].join(', ')})`);
});
