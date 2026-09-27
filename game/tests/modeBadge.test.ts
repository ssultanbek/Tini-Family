import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialState, reduce } from '../../shared/reducer.ts';
import { modeBadge } from '../src/ui/modeBadge.ts';

test('v1.4 mode badge: Recorded run / Live / Mock / Observing, "Connected" before any mode, never Live for a replay', () => {
  const at = (mode?: 'live' | 'replay' | 'observe' | 'mock') => {
    let w = initialState();
    if (mode) w = reduce(w, { seq: 1, ts: 0, actor: 'system', type: 'session.mode', mode });
    return modeBadge(w, true, true).text;
  };
  assert.equal(at(), '● Connected');
  assert.equal(at('replay'), '● Recorded run');
  assert.equal(at('live'), '● Live');
  assert.equal(at('mock'), '● Mock');
  assert.equal(at('observe'), '● Observing');
  assert.equal(modeBadge(initialState(), false, false).text, '○ Offline');
});
