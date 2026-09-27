import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { yardLayout, familyLayout, canvasWidth } from '../layout.ts';
import { store } from '../store.ts';
import { familyPresentation } from '../familyPresentation.ts';

/** Downward bubbles stay over the yard itself, so they cover neither the top signs nor the side signs. */
function bubbleX(bubble: { x: number; y: number }) {
  if (bubble.y >= familyLayout.bubble.flipY) return bubble.x;
  const g = yardLayout.ground, half = familyLayout.bubble.insideHalf;
  return Math.max(g.x + half, Math.min(g.x + g.width - half, bubble.x));
}

export function Yard() {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const bubbles = useSyncExternalStore(familyPresentation.subscribe, familyPresentation.getSnapshot, familyPresentation.getSnapshot);
  const { world } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    let cancelled = false;
    let game: import('phaser').Game | undefined;
    // The emergency dashboard never imports or initializes Phaser.
    // Canvas text only uses a web font that is already loaded, so wait for it (briefly) before drawing.
    const fonts = Promise.race([
      Promise.all(yardLayout.type.load.map(font => document.fonts.load(font))).catch(() => undefined),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]);
    void Promise.all([import('phaser'), import('../scene/YardScene.ts'), fonts]).then(([{ default: Phaser }, { YardScene }]) => {
      if (cancelled || !host.current) return;
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: host.current,
        width: canvasWidth, height: yardLayout.height,
        pixelArt: true, roundPixels: true, backgroundColor: '#d7dfcc',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [YardScene], audio: { noAudio: true },
      });
    }).catch(() => { if (!cancelled) setError('The yard could not load. Open the dashboard to continue.'); });
    return () => { cancelled = true; game?.destroy(true); };
  }, []);
  // Two characters talking at once (e.g. Tini and Tina) would stack on top of each other: lift the later bubble clear.
  const bubbleLayer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const items = [...(bubbleLayer.current?.children ?? [])] as HTMLElement[];
    const placed: DOMRect[] = [];
    for (const item of items) {
      item.style.setProperty('--lift', '0px');
      let rect = item.getBoundingClientRect(), lift = 0;
      // Bubbles above a character move further up; bubbles below one move further down.
      const down = item.classList.contains('bubble-below');
      for (const other of placed) {
        if (rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top) {
          lift += down ? other.bottom - rect.top + 8 : rect.bottom - other.top + 8;
          item.style.setProperty('--lift', `${lift}px`);
          rect = item.getBoundingClientRect();
        }
      }
      placed.push(rect);
    }
  }, [bubbles]);
  const description = `Tini in blue, Tina in purple, Dog in amber. Dog is ${world.dog}. ${world.bricks} bricks placed. ${world.segments.map(segment => `${segment.label}: ${segment.status}. ${segment.detail}`).join('. ') || 'No fence proposed yet.'}`;
  return <section className="yard-view" aria-label="The yard">
    <div className="yard-caption"><strong>The yard</strong><span>Only what the job needs</span><span className={`gv-phase ${['planning', 'fencing', 'building', 'inspecting'].includes(world.phase) ? 'busy' : world.phase === 'launched' ? 'done' : ''}`}>{world.phase}</span></div>
    {error ? <p role="alert">{error} <a href="/?view=dashboard">Dashboard</a></p> : <div className="yard-stage">
      <div className="yard-canvas" ref={host} role="img" aria-label={description} />
      <div className="family-bubbles" aria-live="polite" ref={bubbleLayer}>{bubbles.map(bubble => <div key={bubble.actor} className={`family-bubble bubble-${bubble.actor}${bubble.y < familyLayout.bubble.flipY ? ' bubble-below' : ''}`} style={{
        // Bubble x is in yard coordinates; the canvas also shows the Mac strip to its left.
        left: `${Math.max(familyLayout.bubble.edge, Math.min(canvasWidth - familyLayout.bubble.edge, bubbleX(bubble) + yardLayout.mac.strip)) / canvasWidth * 100}%`,
        top: `${(bubble.y < familyLayout.bubble.flipY ? bubble.y + familyLayout.bubble.belowOffset : bubble.y - familyLayout.bubble.offsetY) / yardLayout.height * 100}%`,
        '--bubble-width': `${familyLayout.bubble.width / canvasWidth * 100}%`,
        '--bubble-padding': `${familyLayout.bubble.padding}px`, '--bubble-font': `${familyLayout.bubble.fontSize}px`,
      } as CSSProperties}><strong>{bubble.actor === 'tini' ? 'Tini' : bubble.actor === 'tina' ? 'Tina' : 'Dog'}</strong><p>{bubble.text}</p></div>)}</div>
    </div>}
    <p className="yard-help">○ Planned &nbsp; ▤ Built &nbsp; ◉ Inspecting &nbsp; ⚠ Needs fix &nbsp; ✓ Green</p>
    <p className="yard-note">Live engine state · Art: Kenney Tiny Town &amp; Tiny Dungeon (CC0)</p>
  </section>;
}
