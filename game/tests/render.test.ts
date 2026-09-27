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
      const phase = store.getSnapshot().world.phase;
      assert.equal(page.includes('■ Stop'), ['planning', 'contract', 'fencing', 'building'].includes(phase), `${view}: Stop only while stoppable (${phase})`);
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

test('a v1.2 prompt.suggested pre-fills the prompt bar in both views; sending clears it', async () => {
  const { store } = await vite.ssrLoadModule('/src/store.ts') as typeof import('../src/store.ts');
  const { Dashboard } = await vite.ssrLoadModule('/src/ui/Dashboard.tsx') as typeof import('../src/ui/Dashboard.tsx');
  const { GameView } = await vite.ssrLoadModule('/src/ui/GameView.tsx') as typeof import('../src/ui/GameView.tsx');
  const { initialState } = await import('../../shared/reducer.ts');
  const pages = () => [renderToString(createElement(GameView, { send: () => true })), renderToString(createElement(Dashboard, { send: () => true }))];
  store.connection(true);
  store.snapshot({ ...initialState(), seq: 500, phase: 'ready', launchUnlocked: true, turns: [{ id: 1, prompt: 'Build it', summary: 'Built' }] });
  for (const page of pages()) assert.ok(!page.includes('Make the header darker</textarea>'));
  store.event({ actor: 'system', type: 'prompt.suggested', text: 'Make the header darker', seq: 501, ts: 0 });
  for (const page of pages()) assert.ok(page.includes('Make the header darker</textarea>'), 'suggestion pre-filled');
  store.event({ actor: 'system', type: 'user.prompt', text: 'Make the header darker', seq: 502, ts: 0 });
  assert.equal(store.getSnapshot().world.suggestedPrompt, null);
});

test('a long turn summary shows a preview with "more"; a short one shows whole', async () => {
  const { store } = await vite.ssrLoadModule('/src/store.ts') as typeof import('../src/store.ts');
  const { GameView } = await vite.ssrLoadModule('/src/ui/GameView.tsx') as typeof import('../src/ui/GameView.tsx');
  const { initialState } = await import('../../shared/reducer.ts');
  const long = 'Added a careers page with three job listings, an apply form that emails the office, and a link in the header; also darkened the header and fixed two broken image paths in the gallery.';
  store.connection(true);
  store.snapshot({ ...initialState(), seq: 700, phase: 'ready', turns: [{ id: 1, prompt: 'Build it', summary: 'Built.' }, { id: 2, prompt: 'Careers', summary: long }] });
  const html = renderToString(createElement(GameView, { send: () => true }));
  assert.ok(html.includes('aria-expanded="false"') && html.includes('>more</button>'));
  assert.ok(!html.includes('fixed two broken image paths'), 'collapsed by default');
  assert.equal(html.split('>more</button>').length, 2, 'only the long summary gets the link');
});

test('v1.3: a cleared finding card says "Cleared" with the reason, then leaves when the segment turns green', async () => {
  const { store } = await vite.ssrLoadModule('/src/store.ts') as typeof import('../src/store.ts');
  const { GameView } = await vite.ssrLoadModule('/src/ui/GameView.tsx') as typeof import('../src/ui/GameView.tsx');
  const { initialState } = await import('../../shared/reducer.ts');
  const finding = { id: 'f1', segmentId: 'photos', severity: 'high' as const, title: 'GPS in photos', explanation: 'x', fixes: [{ id: 'strip-exif', label: 'Strip GPS' }] };
  // React joins text pieces with <!-- --> markers; compare the visible text.
  const page = () => renderToString(createElement(GameView, { send: () => true })).replaceAll('<!-- -->', '');
  store.connection(true);
  store.snapshot({ ...initialState(), seq: 800, phase: 'building', segments: [{ id: 'photos', label: 'Photos', kind: 'folder', detail: '', status: 'built' }] });
  store.event({ actor: 'tina', type: 'segment.red', segmentId: 'photos', finding, seq: 801, ts: 0 });
  assert.ok(page().includes('Strip GPS'), 'open finding shows its fix button');
  store.event({ actor: 'tina', type: 'finding.cleared', findingId: 'f1', reason: 'Claude removed the GPS data', seq: 802, ts: 0 });
  const cleared = page();
  assert.ok(cleared.includes('✓ Cleared') && cleared.includes('Claude removed the GPS data') && !cleared.includes('Strip GPS'));
  store.event({ actor: 'tina', type: 'segment.green', segmentId: 'photos', seq: 803, ts: 0 });
  assert.ok(!page().includes('✓ Cleared'), 'gone once Tina turns the segment green');
});

test('suggestion chips hide prompts already sent in this project', async () => {
  const { store } = await vite.ssrLoadModule('/src/store.ts') as typeof import('../src/store.ts');
  const { GameView } = await vite.ssrLoadModule('/src/ui/GameView.tsx') as typeof import('../src/ui/GameView.tsx');
  const { initialState } = await import('../../shared/reducer.ts');
  store.connection(true);
  store.snapshot({ ...initialState(), seq: 900, phase: 'ready', turns: [{ id: 1, prompt: 'Build it', summary: 'Built.' }, { id: 2, prompt: 'Make the header darker', summary: 'Done.' }] });
  const html = renderToString(createElement(GameView, { send: () => true }));
  assert.ok(!html.includes('>Make the header darker</button>'), 'already sent');
  assert.ok(html.includes('Rivera-HR</button>'), 'not sent yet, still offered');
});

test('speech bubbles of characters in the upper yard sit below them, so the top signs stay visible', async () => {
  const { familyPresentation } = await vite.ssrLoadModule('/src/familyPresentation.ts') as typeof import('../src/familyPresentation.ts');
  const { Yard } = await vite.ssrLoadModule('/src/ui/Yard.tsx') as typeof import('../src/ui/Yard.tsx');
  const { familyLayout } = await vite.ssrLoadModule('/src/layout.ts') as typeof import('../src/layout.ts');
  familyPresentation.set([
    { actor: 'tina', text: 'There is a driver\'s license scan in there.', x: 760, y: 318 },
    { actor: 'tini', text: 'Nope. Not your house, buddy.', x: 355, y: 610 },
  ]);
  const html = renderToString(createElement(Yard));
  const tina = html.slice(html.indexOf('bubble-tina'), html.indexOf('bubble-tini'));
  const tini = html.slice(html.indexOf('bubble-tini'));
  assert.ok(tina.includes('bubble-below'), 'Tina near the top speaks downward');
  assert.ok(!tini.slice(0, 40).includes('bubble-below'), 'Tini lower down keeps the bubble above');
  const top = Number(/top:([\d.]+)%/.exec(tina)?.[1]);
  assert.ok(top > (318 / 880) * 100, `bubble starts below Tina (top ${top}%)`);
  assert.ok(familyLayout.bubble.flipY > 318);
  familyPresentation.set([]);
});

test('grouped findings (engine polish): long titles, counts and per-group fix labels render whole, one card each', async () => {
  const { store } = await vite.ssrLoadModule('/src/store.ts') as typeof import('../src/store.ts');
  const { GameView } = await vite.ssrLoadModule('/src/ui/GameView.tsx') as typeof import('../src/ui/GameView.tsx');
  const { Dashboard } = await vite.ssrLoadModule('/src/ui/Dashboard.tsx') as typeof import('../src/ui/Dashboard.tsx');
  const { OPEN_FINDINGS_PLACEHOLDER } = await vite.ssrLoadModule('/src/ui/Project.tsx') as typeof import('../src/ui/Project.tsx');
  const { initialState, reduce } = await import('../../shared/reducer.ts');
  // Shaped like engine/src/tina/findings.ts toFinding() for groups of several files.
  const grouped = [
    { id: 'g-gps', segmentId: 'photos', severity: 'medium' as const, title: '1,212 photos still have GPS locations',
      explanation: 'These photos record where they were taken, which can reveal job sites and homes. Found in 1,212 files, like assets/jobsite/IMG_0001.jpg and assets/jobsite/IMG_0002.jpg (GPS latitude/longitude in EXIF).',
      file: 'assets/jobsite/IMG_0001.jpg and 1,211 more', fixes: [{ id: 'strip-metadata', label: 'Remove the hidden details' }, { id: 'remove-photo', label: 'Remove these 1,212 photos' }] },
    { id: 'g-author', segmentId: 'photos', severity: 'low' as const, title: '42 photos still say who took them',
      explanation: 'The camera wrote the owner\'s name into each photo. Found in 42 files, like assets/team/crew-01.jpg and assets/team/crew-02.jpg (Artist and Copyright tags).',
      file: 'assets/team/crew-01.jpg and 41 more', fixes: [{ id: 'strip-metadata', label: 'Remove the hidden details' }, { id: 'remove-photo', label: 'Remove these 42 photos' }] },
    { id: 'g-keys', segmentId: 'web-packages', severity: 'high' as const, title: 'API keys in 3 files of your website',
      explanation: 'Anyone who opens the site can copy these keys and run up charges on your account. Found in 3 files, like js/main.js and contact.html (Google Maps API key).',
      file: 'js/main.js and 2 more', fixes: [{ id: 'move-key-to-env', label: 'Move keys out of the website' }] },
  ];
  let world = { ...initialState(), seq: 1000, phase: 'ready' as const, segments: [
    { id: 'photos', label: 'Projects', kind: 'folder' as const, detail: '31 photos', status: 'built' as const },
    { id: 'web-packages', label: 'Web packages', kind: 'packages' as const, detail: 'npm registry only', status: 'built' as const } ] };
  world = grouped.reduce((w, finding, i) => reduce(w, { actor: 'tina', type: 'segment.red', segmentId: finding.segmentId, finding, seq: 1001 + i, ts: 0 }), world);
  store.connection(true);
  store.snapshot(world);
  for (const [view, html] of [['game', renderToString(createElement(GameView, { send: () => true }))], ['dashboard', renderToString(createElement(Dashboard, { send: () => true }))]] as const) {
    const page = html.replaceAll('<!-- -->', '');
    for (const finding of grouped) {
      assert.ok(page.includes(`>${finding.title}</h2>`), `${view}: full title "${finding.title}"`);
      assert.ok(page.includes(finding.explanation.replaceAll("'", '&#x27;')), `${view}: full explanation for ${finding.id}`);
      for (const fix of finding.fixes) assert.ok(page.includes(`>${fix.label}</button>`), `${view}: fix "${fix.label}"`);
    }
    assert.equal(page.split('class="card finding"').length - 1, 3, `${view}: one card per group`);
    assert.ok(page.includes(`placeholder="${OPEN_FINDINGS_PLACEHOLDER}"`), `${view}: open-findings placeholder`);
  }
  assert.equal(OPEN_FINDINGS_PLACEHOLDER, 'Fix the red spots before launching, or ask for a change');
});
