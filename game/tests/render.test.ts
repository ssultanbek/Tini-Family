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
  const { GameView } = await vite.ssrLoadModule('/src/ui/GameView.tsx') as typeof import('../src/ui/GameView.tsx');
  store.connection(true);
  const render = (dashboard: boolean) => renderToString(dashboard ? createElement(Dashboard, { send: () => true }) : createElement(GameView, { send: () => true }));
  const seen = new Set<string>();
  for (const event of recorded) {
    store.event(event);
    const dashboardHtml = render(true), gameHtml = render(false);
    for (const [view, page] of [['dashboard', dashboardHtml], ['game', gameHtml]]) {
      assert.ok(page.includes('keys to the room, not the house'), `${view}: title bar tagline`);
      if (store.getSnapshot().world.phase === 'building') assert.ok(page.includes('Tini is working'), `${view}: prompt bar is disabled while the crew works`);
    }
    const html = dashboardHtml + gameHtml;
    if (store.getSnapshot().world.contract) seen.add('contract');
    if (store.getSnapshot().world.openEscalation) seen.add('escalation');
    if (html.includes('✓ Fixed')) seen.add('fixed-finding');
    if (html.includes('report-screen') && html.includes('Data leaves to') && html.includes('fonts.googleapis.com')) seen.add('report');
    if (html.includes('Claude is asking for more')) seen.add('agent-escalation');
    if (html.includes('Your request needs something outside the fence')) seen.add('prompt-escalation');
    if (html.includes('🔒')) seen.add('launch-locked');
    if (html.includes('Turn 3')) seen.add('turn-history');
    if (html.includes('prompt-bar')) seen.add('prompt-bar');
  }
  assert.deepEqual([...seen].sort(), ['agent-escalation', 'contract', 'escalation', 'fixed-finding', 'launch-locked', 'prompt-bar', 'prompt-escalation', 'report', 'turn-history']);
});

test('the raw view renders every channel and pretty JSON for the whole story', async () => {
  const { RawView } = await vite.ssrLoadModule('/src/ui/RawView.tsx') as typeof import('../src/ui/RawView.tsx');
  const { initialState, reduce } = await import('../../shared/reducer.ts');
  const world = recorded.reduce(reduce, initialState());
  const html = renderToString(createElement(RawView, { events: recorded, rawLog: world.rawLog, onClose: () => {} }));
  for (const channel of ['hook', 'config', 'sdk']) assert.ok(html.includes(`ch-${channel}`), channel);
  assert.ok(world.rawLog.length > 0);
  const { highlightJson } = await vite.ssrLoadModule('/src/ui/RawView.tsx') as typeof import('../src/ui/RawView.tsx');
  for (const event of recorded) {
    const pre = renderToString(createElement('pre', null, ...highlightJson(event)));
    const text = pre.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.equal(text, JSON.stringify(event, null, 2), 'highlighting never changes the JSON text');
  }
});
