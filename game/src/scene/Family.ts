import Phaser from 'phaser';
import type { EngineEvent, WorldState } from '../../../shared/events.ts';
import { familyLayout as F, segmentPosition, brickPosition } from '../layout.ts';
import { animationQueues, type AnimatedActor, type AnimationOptions } from '../queue.ts';
import { familyPresentation } from '../familyPresentation.ts';
import { store } from '../store.ts';
import { frames, sheets } from './art.ts';

type Character = { root: Phaser.GameObjects.Container; box: Phaser.GameObjects.Container; count: Phaser.GameObjects.Text;
  lens: Phaser.GameObjects.Graphics; state: Phaser.GameObjects.Text; speech?: { text: string; until: number } };
const colors = { tini: 0x267fc4, tina: 0xa74891, dog: 0xc58036 };
const names = { tini: 'Tini', tina: 'Tina', dog: 'Dog' };
const actors = Object.keys(names) as AnimatedActor[];

export class Family {
  private characters = {} as Record<AnimatedActor, Character>;
  private detach: () => void;
  private lastBubbles = '';
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(private scene: Phaser.Scene) {
    for (const actor of actors) this.characters[actor] = this.draw(actor);
    this.detach = animationQueues.attach((event, options) => this.animate(event, options));
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
  }
  private text(x: number, y: number, value: string, size: number) {
    return this.scene.add.text(x, y, value, { fontFamily: 'Arial, sans-serif', fontSize: size, color: '#172f24',
      fontStyle: 'bold', backgroundColor: '#fffdf4', padding: { x: F.labelPadding, y: F.labelPadding } }).setOrigin(0.5);
  }
  private draw(actor: AnimatedActor): Character {
    const p = F.homes[actor], b = F.body;
    const root = this.scene.add.container(p.x, p.y).setDepth(20);
    const g = this.scene.add.graphics();
    g.fillStyle(0x213a2b, 0.25).fillEllipse(0, b.shadowY, b.shadowWidth, b.shadowHeight);
    const parts: Phaser.GameObjects.GameObject[] = [g];
    if (actor !== 'dog') {
      // Tini and Tina are Kenney Tiny Dungeon characters; only the dog is still drawn.
      parts.push(this.scene.add.image(0, F.sprite.y, 'dungeon', frames[actor]).setDisplaySize(sheets.tile * F.sprite.scale, sheets.tile * F.sprite.scale));
    } else {
      g.fillStyle(0x273c46).fillRoundedRect(-b.footX - b.footWidth / 2, b.footY, b.footWidth, b.footHeight, b.radius / 2)
        .fillRoundedRect(b.footX - b.footWidth / 2, b.footY, b.footWidth, b.footHeight, b.radius / 2);
      g.fillStyle(colors.dog).fillRoundedRect(-b.width / 2, -b.height / 2, b.width, b.height, b.radius);
      g.fillStyle(0xe1a55b).fillCircle(0, b.headY, b.headRadius);
      g.fillStyle(0x6d4226).fillEllipse(-b.earX, b.earY, b.earWidth, b.earHeight).fillEllipse(b.earX, b.earY, b.earWidth, b.earHeight);
      g.fillStyle(0x342b25).fillCircle(0, b.noseY, b.noseRadius);
      g.fillStyle(0x192b2a).fillCircle(-b.eyeX, b.eyeY, b.eyeRadius).fillCircle(b.eyeX, b.eyeY, b.eyeRadius);
    }
    const label = this.text(0, F.nameY, names[actor], F.nameSize);
    const state = this.text(0, F.stateY, '', F.stateSize).setVisible(actor === 'dog');
    const box = this.scene.add.container(F.box.x, F.box.y).setVisible(false);
    const carton = this.scene.add.graphics();
    carton.fillStyle(0xf0c782).fillRect(-F.box.width / 2, -F.box.height / 2, F.box.width, F.box.height);
    carton.lineStyle(2, 0x68462b).strokeRect(-F.box.width / 2, -F.box.height / 2, F.box.width, F.box.height);
    carton.fillStyle(0xffe7b5).fillRect(-F.box.tapeWidth / 2, -F.box.height / 2, F.box.tapeWidth, F.box.height);
    const count = this.text(0, 0, '', F.box.textSize).setBackgroundColor('');
    box.add([carton, count]);
    const lens = this.scene.add.graphics().setVisible(false);
    const l = F.inspection;
    lens.fillStyle(0xe2fbff, 0.8).fillCircle(l.x, l.y, l.radius);
    lens.lineStyle(l.stroke, 0x34364a).strokeCircle(l.x, l.y, l.radius).lineBetween(l.x + l.radius, l.y + l.radius, l.x + l.radius + l.handle, l.y + l.radius + l.handle);
    root.add([...parts, label, state, box, lens]);
    return { root, box, count, lens, state };
  }
  sync(world: WorldState, instant: boolean) {
    this.characters.dog.state.setText({ sleeping: 'zzz · sleeping', waiting: '? · waiting', working: '▤ working', done: '✓ done' }[world.dog]);
    if (!instant) return;
    for (const actor of actors) {
      const c = this.characters[actor];
      // Snapshots contain no actor locations: use stable staging points, never replay history.
      const p = actor === 'dog' && world.dog !== 'sleeping' ? F.zones.house : F.homes[actor];
      c.root.setPosition(p.x, p.y); c.box.setVisible(false); c.lens.setVisible(false); c.speech = undefined;
    }
    this.lastBubbles = ''; familyPresentation.set([]);
  }
  private update() {
    const bubbles = actors.flatMap(actor => {
      const c = this.characters[actor];
      if (!c.speech || c.speech.until <= performance.now()) { c.speech = undefined; return []; }
      return [{ actor, text: c.speech.text, x: Math.round(c.root.x), y: Math.round(c.root.y) }];
    });
    const signature = JSON.stringify(bubbles);
    if (signature !== this.lastBubbles) { this.lastBubbles = signature; familyPresentation.set(bubbles); }
  }
  private atSegment(id?: string, distance?: number) {
    return segmentPosition(store.getSnapshot().world.segments.findIndex(segment => segment.id === id), distance);
  }
  private tween(target: Phaser.GameObjects.Container, point: { x: number; y: number }, duration: number, options: AnimationOptions) {
    if (options.signal.aborted || options.speed === 'instant' || this.reducedMotion) {
      if (options.signal.reason !== 'clear') target.setPosition(point.x, point.y);
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      const finish = () => { options.signal.removeEventListener('abort', abort); resolve(); };
      const tween = this.scene.tweens.add({ targets: target, ...point, duration: duration * (options.speed === 'fast' ? F.motion.fastFactor : 1), ease: 'Sine.easeInOut', onComplete: finish });
      const abort = () => { tween.stop(); if (options.signal.reason !== 'clear') target.setPosition(point.x, point.y); finish(); };
      options.signal.addEventListener('abort', abort, { once: true });
    });
  }
  private async animate(event: EngineEvent, options: AnimationOptions) {
    if (event.actor === 'system') return;
    const c = this.characters[event.actor];
    const move = (p: { x: number; y: number }, duration = F.motion.walk) => this.tween(c.root, p, duration, options);
    if (event.type === 'speech') {
      c.speech = { text: event.text, until: performance.now() + F.motion.speech }; this.update(); return;
    }
    switch (event.type) {
      case 'tini.carry.box':
        await move(F.zones.gate, F.motion.carryLeg);
        if (options.signal.reason === 'clear') return;
        c.count.setText(`${event.fileCount}`); c.box.setVisible(true);
        await move(this.atSegment(event.segmentId), F.motion.carryLeg);
        c.box.setVisible(false); break;
      case 'fence.segment.built': await move(this.atSegment(event.segment.id)); break;
      case 'dog.brick.placed': {
        await move(F.zones.house);
        if (options.signal.reason === 'clear') return;
        // World bricks already rendered; this small carried brick only decorates placement.
        const brick = this.scene.add.container(c.root.x + F.brick.x, c.root.y + F.brick.y).setDepth(21);
        const g = this.scene.add.graphics().fillStyle(0xc47b51).fillRect(0, 0, F.brick.width, F.brick.height);
        brick.add(g);
        await this.tween(brick, brickPosition(event.bricks), F.motion.place, options);
        brick.destroy(); break;
      }
      case 'tina.inspect.started': case 'tina.inspect.segment':
        await move(event.segmentId ? this.atSegment(event.segmentId) : F.zones.yard);
        if (options.signal.reason === 'clear') return;
        c.lens.setVisible(true);
        await move({ x: c.root.x, y: c.root.y }, F.motion.look);
        c.lens.setVisible(false); break;
      case 'fence.blocked': {
        await move(this.atSegment(event.segmentId, F.bumpApproach));
        if (options.signal.reason === 'clear') return;
        const sparks = this.scene.add.container(c.root.x, c.root.y).setDepth(22);
        const g = this.scene.add.graphics();
        for (let i = 0; i < F.spark.count; i++) {
          const angle = i * Math.PI * 2 / F.spark.count;
          const x = Math.cos(angle) * F.spark.distance, y = Math.sin(angle) * F.spark.distance;
          g.lineStyle(F.spark.stroke, 0xfff5a2).lineBetween(x / 2, y / 2, x, y);
          g.fillStyle(0xffc53d).fillCircle(x, y, F.spark.radius);
        }
        sparks.add(g);
        try { await move(this.atSegment(event.segmentId), F.motion.bump); } finally { sparks.destroy(); }
        break;
      }
    }
  }
  destroy() {
    this.detach(); this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    familyPresentation.set([]);
    for (const c of Object.values(this.characters)) c.root.destroy();
  }
}
