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

test('v1.3: a finding cleared on a rescan shows as cleared (with the reason) until its segment turns green', () => {
  const events: EngineEvent[] = [
    story[0], story[1],
    { seq: 3, ts: 0, actor: 'tina', type: 'finding.cleared', findingId: 'f1', reason: 'Claude removed the GPS data in turn 2' },
    { seq: 4, ts: 0, actor: 'tina', type: 'segment.green', segmentId: 'photos' },
  ];
  let world = initialState();
  const seen: string[] = [];
  const log: EngineEvent[] = [];
  for (const event of events) {
    world = reduce(world, event); log.push(event);
    seen.push(fixedAwaitingGreen(world, log).map(item => `${item.how}:${item.summary}`).join());
  }
  assert.deepEqual(seen, ['', '', 'cleared:Claude removed the GPS data in turn 2', '']);
  assert.equal(world.findings.length, 0, 'the reducer removed the finding');
});

test('a re-reported finding is open again, and a second fix shows once', () => {
  let world = initialState();
  const log: EngineEvent[] = [];
  for (const event of [...story.slice(0, 3), story[1], story[2]]) { world = reduce(world, event); log.push(event); }
  assert.deepEqual(fixedAwaitingGreen(world, log).map(item => item.finding.id), ['f1']);
});
