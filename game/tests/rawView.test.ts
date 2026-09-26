import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitRawLine } from '../src/ui/rawLine.ts';

test('raw lines split back into channel and text', () => {
  assert.deepEqual(splitRawLine('[hook] PreToolUse Read ~/.ssh/id_rsa -> DENY'), { channel: 'hook', text: 'PreToolUse Read ~/.ssh/id_rsa -> DENY' });
  assert.deepEqual(splitRawLine('[config] sandbox: {"a":[1]}'), { channel: 'config', text: 'sandbox: {"a":[1]}' });
  assert.deepEqual(splitRawLine('no channel'), { channel: 'other', text: 'no channel' });
});
