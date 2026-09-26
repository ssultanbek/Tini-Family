import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampText } from '../src/ui/clampText.ts';

test('summaries up to 160 characters are shown whole; longer ones are cut at a word with "…"', () => {
  assert.equal(clampText('Built a 3-page site: home, services, gallery.'), null);
  assert.equal(clampText('x'.repeat(160)), null);
  const long = 'Added a careers page with three job listings, an apply form that emails the office, and a link in the header; also darkened the header and fixed two broken image paths in the gallery.';
  const short = clampText(long)!;
  assert.ok(short.length <= 160 && short.endsWith('…') && long.startsWith(short.slice(0, -1)), short);
  assert.ok(!/\s…$/.test(short), 'no dangling space before the ellipsis');
});
