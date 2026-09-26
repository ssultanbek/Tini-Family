import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Phase } from '../../shared/events.ts';
import { promptCommand, reportVisible } from '../src/ui/promptMode.ts';

test('the prompt bar sends start when idle, prompt when ready or launched, and nothing while the crew works', () => {
  assert.deepEqual(promptCommand('idle', 'Build it'), { type: 'start', prompt: 'Build it' });
  assert.deepEqual(promptCommand('ready', 'Darker header'), { type: 'prompt', text: 'Darker header' });
  assert.deepEqual(promptCommand('launched', 'Careers page'), { type: 'prompt', text: 'Careers page' });
  for (const phase of ['planning', 'contract', 'fencing', 'building', 'inspecting'] as Phase[]) assert.equal(promptCommand(phase, 'x'), null, phase);
});

test('the report pops up only right after launch, unless opened by hand', () => {
  assert.equal(reportVisible('auto', 'launched', true), true);
  assert.equal(reportVisible('auto', 'planning', true), false, 'a new turn tucks the old report away');
  assert.equal(reportVisible('open', 'ready', true), true);
  assert.equal(reportVisible('closed', 'launched', true), false);
  assert.equal(reportVisible('open', 'launched', false), false);
});
