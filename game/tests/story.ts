// Bounded live check. Requires Altair's mock server on port 4000; starts no server.
// It resets the shared mock session and drives real commands through src/net.ts.
import assert from 'node:assert/strict';
import { connectEngine } from '../src/net.ts';
import { createStore } from '../src/store.ts';
import type { EscalationOption, GameCommand } from '../../shared/events.ts';

const choice = (process.argv[2] ?? 'narrow') as EscalationOption['id'];
assert.ok(['narrow', 'all', 'deny'].includes(choice));
let store = createStore();
let client = connectEngine(store);
let unsubscribe = () => {};
let resetSent = false;
let started = false;
let refreshed = false;
let refreshing = false;
let stopped = false;
const sent = new Set<string>();
const timeout = setTimeout(() => finish(new Error('Timed out. Start the mock with --speed 3, then retry.')), 55000);
function finish(error?: unknown) {
  if (stopped) return;
  stopped = true;
  clearTimeout(timeout); unsubscribe(); client.disconnect();
  if (error) { console.error(error); process.exitCode = 1; }
}
function once(key: string, command: GameCommand) {
  if (sent.has(key)) return;
  sent.add(key);
  assert.ok(client.send(command), `command sent: ${key}`);
}
function check() {
  if (stopped || refreshing) return;
  try {
    const state = store.getSnapshot();
    if (!state.connected || !state.synced) return;
    const world = state.world;
    if (!resetSent) { resetSent = true; once('reset', { type: 'reset' }); return; }
    if (state.pending.includes('reset')) return;
    if (world.phase === 'idle' && !started) { started = true; once('start', { type: 'start', prompt: 'Build a modern, serious-looking website for Rivera Construction. Use the photos in /Clients/Rivera/Photos and the company info in /Clients/Rivera/About and /Clients/Rivera/Services.' }); }
    if (world.contract) {
      once('adjust', { type: 'adjust.plan', text: 'Keep access limited to this job.' });
      once('approve', { type: 'approve.plan' });
    }
    if (world.openEscalation && !refreshed) {
      // A fresh store + fresh connection is the same transport recovery as reload.
      refreshing = true;
      unsubscribe(); client.disconnect();
      store = createStore(); client = connectEngine(store);
      refreshed = true; refreshing = false;
      unsubscribe = store.subscribe(() => queueMicrotask(check));
      return;
    }
    if (world.openEscalation) {
      assert.ok(world.bricks >= 6);
      assert.equal(world.segments.length, 5);
      assert.equal(world.blocked.length, 2);
      once('escalation', { type: 'escalation.choose', escalationId: world.openEscalation.escalationId, optionId: choice });
    }
    for (const finding of world.findings) once(finding.id, { type: 'fix.apply', findingId: finding.id, fixId: finding.fixes[0].id });
    if (world.launchUnlocked) once('launch', { type: 'launch' });
    if (world.report) {
      assert.ok(refreshed);
      assert.equal(world.phase, 'launched');
      assert.equal(world.findings.length, 0);
      assert.equal(world.bricks, 10);
      assert.equal(world.segments.length, choice === 'deny' ? 5 : 6);
      assert.ok(world.segments.every(segment => segment.status === 'green'));
      assert.equal(world.blocked.filter(block => block.simulated).length, 1);
      console.log(JSON.stringify({ result: 'PASS', choice, reconnectedMidStory: refreshed, phase: world.phase, bricks: world.bricks, blocked: world.blocked.length, segments: world.segments, report: world.report }, null, 2));
      finish();
    }
  } catch (error) { finish(error); }
}
unsubscribe = store.subscribe(() => queueMicrotask(check));
