import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EngineEvent, Finding } from '../../shared/events.ts';
import { initialState, reduce } from '../../shared/reducer.ts';
import { fixedAwaitingGreen } from '../src/ui/fixedFindings.ts';

const finding: Finding = { id: 'f1', segmentId: 'photos', severity: 'high', title: 'GPS in photos', explanation: 'x', fixes: [{ id: 'strip-exif', label: 'Strip' }] };
const story: EngineEvent[] = [
  { seq: 1, ts: 0, actor: 'tini', type: 'fence.segment.built', segment: { id: 'photos', label: 'Photos', kind: 'folder', detail: '', status: 'built' } },
  { seq: 2, ts: 0, actor: 'tina', type: 'segment.red', segmentId: 'photos', finding },
  { seq: 3, ts: 0, actor: 'tina', type: 'fix.applied', findingId: 'f1', fixId: 'strip-exif', summary: 'Strip: done' },
  { seq: 4, ts: 0, actor: 'tina', type: 'segment.green', segmentId: 'photos' },
];

test('a fixed finding lingers only between fix.applied and segment.green', () => {
  const seen: number[] = [];
  let world = initialState();
  const events: EngineEvent[] = [];
  for (const event of story) {
    world = reduce(world, event); events.push(event);
    seen.push(fixedAwaitingGreen(world, events).length);
  }
  assert.deepEqual(seen, [0, 0, 1, 0]);
  world = reduce(world, story[1]);
  assert.equal(fixedAwaitingGreen(world, [...events, story[1]]).length, 0, 're-reported finding is open again');
});

test('after a snapshot (no events) nothing lingers', () => {
  let world = initialState();
  for (const event of story.slice(0, 3)) world = reduce(world, event);
  assert.equal(fixedAwaitingGreen(world, []).length, 0);
});
