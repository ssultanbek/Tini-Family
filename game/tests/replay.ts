// Replay check: drives a recording (e.g. mock/recordings/demo-main.jsonl) through src/net.ts + the store,
// answering whatever the recording waits for, and checks the end state. Requires the mock running with
// --recording <file>; starts no server. The recording holds one fixed run, so the escalation answer given
// here (narrow/all/deny) is accepted but the recorded outcome plays either way.
import assert from 'node:assert/strict';
import { connectEngine } from '../src/net.ts';
import { createStore } from '../src/store.ts';
import type { EscalationOption, GameCommand } from '../../shared/events.ts';

const choice = (process.argv[2] ?? 'narrow') as EscalationOption['id'];
const store = createStore();
const client = connectEngine(store);
const sent = new Set<string>();
let resetSent = false, launches = 0, stopped = false;
const timeout = setTimeout(() => finish(new Error('Timed out: is the mock running with --recording?')), 170000);
function finish(error?: unknown) {
  if (stopped) return;
  stopped = true; clearTimeout(timeout); unsubscribe(); client.disconnect();
  if (error) { console.error(error); process.exitCode = 1; }
}
// A click the client refuses (e.g. still pending) is retried on the next update instead of being lost.
function once(key: string, command: GameCommand) { if (sent.has(key)) return; if (client.send(command)) sent.add(key); }
function check() {
  if (stopped) return;
  try {
    const { world, connected, synced, pending } = store.getSnapshot();
    if (!connected || !synced) return;
    if (!resetSent) { resetSent = true; once('reset', { type: 'reset' }); return; }
    if (pending.includes('reset')) return;
    const turn = world.turns.length;
    if (world.phase === 'idle' && world.suggestedPrompt) once('start', { type: 'start', prompt: world.suggestedPrompt });
    if (world.contract && world.phase === 'contract') once(`approve-${turn}`, { type: 'approve.plan' });
    if (world.openEscalation) once(`esc-${world.openEscalation.escalationId}`, { type: 'escalation.choose', escalationId: world.openEscalation.escalationId, optionId: choice });
    for (const finding of world.findings) once(`fix-${finding.id}`, { type: 'fix.apply', findingId: finding.id, fixId: finding.fixes[0].id });
    // Launch only once the current turn has finished (its summary arrived), never while the next one is starting.
    const finished = turn > 0 && !!world.turns[turn - 1]?.summary;
    if (world.launchUnlocked && world.phase === 'ready' && finished && !sent.has(`launch-${turn}`)) { once(`launch-${turn}`, { type: 'launch' }); if (sent.has(`launch-${turn}`)) launches++; }
    if ((world.phase === 'ready' || world.phase === 'launched') && world.suggestedPrompt && turn > 0) once(`prompt-${turn}`, { type: 'prompt', text: world.suggestedPrompt });
    if (world.phase === 'launched' && world.report && turn >= 3 && world.turns.every(t => t.summary)) {
      assert.equal(world.findings.length, 0);
      assert.ok(world.segments.every(segment => segment.status === 'green'), 'all fences green at the end');
      assert.ok(launches >= 2, 'launched after turn 1 and at the end');
      assert.notEqual(world.mode, 'live', 'a recording never reports live');
      console.log(JSON.stringify({ result: 'PASS', choice, turns: world.turns.map(t => t.id), launches, mode: world.mode, segments: world.segments.length, bricks: world.bricks }));
      finish();
    }
  } catch (error) { finish(error); }
}
const unsubscribe = store.subscribe(() => queueMicrotask(check));
