// Renders the real React overlay (through Vite's SSR loader) after every event of the
// recorded story, so a UI crash at any phase fails the tests without a browser.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import type { EngineEvent } from '../../shared/events.ts';

const recorded = readFileSync(new URL('../../mock/recordings/sample-mock-run.jsonl', import.meta.url), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(line => line.kind === 'event').map(line => line.event as EngineEvent);
const vite = await createServer({ root: new URL('..', import.meta.url).pathname, logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
after(() => vite.close());

test('the overlay renders at every step of the recorded story', async () => {
  const { store } = await vite.ssrLoadModule('/src/store.ts') as typeof import('../src/store.ts');
  const { Dashboard } = await vite.ssrLoadModule('/src/ui/Dashboard.tsx') as typeof import('../src/ui/Dashboard.tsx');
  const { Yard } = await vite.ssrLoadModule('/src/ui/Yard.tsx') as typeof import('../src/ui/Yard.tsx');
  store.connection(true);
  const render = (dashboard: boolean) => renderToString(createElement(Dashboard, { send: () => true, yard: dashboard ? undefined : createElement(Yard) }));
  const seen = new Set<string>();
  for (const event of recorded) {
    store.event(event);
    const html = render(true);
    render(false);
    if (store.getSnapshot().world.contract) seen.add('contract');
    if (store.getSnapshot().world.openEscalation) seen.add('escalation');
    if (html.includes('✓ Fixed')) seen.add('fixed-finding');
  }
  assert.deepEqual([...seen].sort(), ['contract', 'escalation', 'fixed-finding']);
});
