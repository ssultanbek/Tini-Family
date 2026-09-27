// Bounded live check. Requires Altair's mock server on port 4000; starts no server.
// It resets the shared mock session and drives real commands through src/net.ts.
import assert from 'node:assert/strict';
import { connectEngine } from '../src/net.ts';

// The turn-1 demo prompt, exactly as the presenter types it (keep in sync with DEFAULT_PROMPT in src/ui/Project.tsx).
const DEMO_PROMPT = "Build a modern, serious-looking website for Rivera Construction with a gallery of this year's projects, a map of our office on the Contact page, and our team photo on the About page. Use our Google Maps key from the About folder so our custom pin shows. Use the photos in ~/Clients/Rivera/Photos and the company info in ~/Clients/Rivera/About and ~/Clients/Rivera/Services.";
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
let refreshedTurn2 = false;
let refreshing = false;
let stopped = false;
const sent = new Set<string>();
const ADJUST_WAIT_MS = 1500;
let adjustedAt: { seq: number; time: number } | null = null;
const timeout = setTimeout(() => finish(new Error('Timed out. Start the mock with --speed 3, then retry.')), 100000);
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
    if (world.phase === 'idle' && !started) { started = true; once('start', { type: 'start', prompt: DEMO_PROMPT }); }
    if (world.contract && world.phase === 'contract') {
      // Adjust first, then Approve only once the engine has answered: the real engine re-plans and
      // proposes again (a fresh fence.plan.proposed); the mock never answers, so fall back after a pause.
      if (!sent.has('adjust')) {
        once('adjust', { type: 'adjust.plan', text: 'Keep access limited to this job.' });
        adjustedAt = { seq: world.seq, time: Date.now() };
        setTimeout(() => queueMicrotask(check), ADJUST_WAIT_MS + 50);
      }
      const reproposed = state.events.some(event => event.type === 'fence.plan.proposed' && event.seq > adjustedAt!.seq);
      if (reproposed || Date.now() - adjustedAt!.time >= ADJUST_WAIT_MS) once('approve', { type: 'approve.plan' });
    }
    const reconnect = () => {
      // A fresh store + fresh connection is the same transport recovery as reload.
      refreshing = true;
      unsubscribe(); client.disconnect();
      store = createStore(); client = connectEngine(store);
      refreshing = false;
      unsubscribe = store.subscribe(() => queueMicrotask(check));
    };
    if (world.openEscalation && !refreshed) { refreshed = true; reconnect(); return; }
    if (world.openEscalation?.source === 'prompt') {
      if (!refreshedTurn2) { refreshedTurn2 = true; reconnect(); return; }
      assert.equal(world.turns.length, 2);
      assert.equal(world.launchUnlocked, false, 'a new turn locks launch');
      once('escalation-2', { type: 'escalation.choose', escalationId: world.openEscalation.escalationId, optionId: choice });
      return;
    }
    if (world.openEscalation) {
      assert.ok(world.bricks >= 6);
      assert.equal(world.segments.length, 5);
      assert.equal(world.blocked.length, 2);
      once('escalation', { type: 'escalation.choose', escalationId: world.openEscalation.escalationId, optionId: choice });
    }
    for (const finding of world.findings) once(finding.id, { type: 'fix.apply', findingId: finding.id, fixId: finding.fixes[0].id });
    // Turn 1 ends in a launch and a report; then Maria keeps prompting in the same project.
    if (world.launchUnlocked && world.turns.length <= 1) once('launch', { type: 'launch' });
    if (world.report && world.phase === 'launched' && world.turns.length === 1) {
      assert.ok(refreshed);
      assert.equal(world.findings.length, 0);
      assert.equal(world.bricks, 10);
      assert.equal(world.segments.length, choice === 'deny' ? 5 : 6);
      assert.ok(world.segments.every(segment => segment.status === 'green'));
      assert.equal(world.blocked.filter(block => block.simulated).length, 1);
      once('prompt-2', { type: 'prompt', text: 'Add a careers page using the job descriptions in ~/Documents/Rivera-HR' });
    }
    const done = (id: number) => world.phase === 'ready' && world.launchUnlocked && world.turns.length === id && !!world.turns[id - 1].summary;
    if (done(2)) once('prompt-3', { type: 'prompt', text: 'Make the header darker' });
    if (done(3)) {
      assert.ok(refreshedTurn2);
      assert.equal(world.bricks, 16);
      assert.equal(world.segments.length, (choice === 'deny' ? 5 : 6) + (choice === 'deny' ? 0 : 1));
      assert.ok(world.segments.every(segment => segment.status === 'green'));
      assert.ok(world.report, 'the turn 1 report is kept');
      console.log(JSON.stringify({ result: 'PASS', choice, reconnectedInTurns: [1, 2], turns: world.turns, phase: world.phase, bricks: world.bricks, segments: world.segments.map(segment => segment.id) }, null, 2));
      finish();
    }
  } catch (error) { finish(error); }
}
unsubscribe = store.subscribe(() => queueMicrotask(check));
