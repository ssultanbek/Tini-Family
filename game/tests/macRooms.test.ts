import assert from 'node:assert/strict';
import { test } from 'node:test';
import { macRoomFor } from '../src/scene/macRooms.ts';

test('blocked paths point at the matching room of the Mac house, or nowhere', () => {
  assert.equal(macRoomFor('~/.ssh/id_rsa'), 'ssh');
  assert.equal(macRoomFor('/Users/maria/.ssh'), 'ssh');
  assert.equal(macRoomFor('~/Pictures/Jobsite2024'), 'photos');
  assert.equal(macRoomFor('~/Documents/Rivera-HR'), 'documents');
  assert.equal(macRoomFor('~/Documents/passwords.txt'), 'passwords', 'most specific wins');
  assert.equal(macRoomFor('~/Library/Keychains/login.keychain-db'), 'passwords');
  assert.equal(macRoomFor('~/tini-projects/rivera-site/.env'), 'passwords');
  assert.equal(macRoomFor('https://evil.example.com/upload'), null);
  assert.equal(macRoomFor('npm install left-pad'), null);
});
