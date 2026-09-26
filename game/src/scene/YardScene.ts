import Phaser from 'phaser';
import type { Segment, SegmentStatus, WorldState } from '../../../shared/events.ts';
import { yardLayout as L } from '../layout.ts';
import { store } from '../store.ts';
import { Family } from './Family.ts';

const styles: Record<SegmentStatus, { color: number; label: string; text: string }> = {
  planned: { color: 0x79858a, label: '○ Planned', text: '#42505a' },
  built: { color: 0x97613b, label: '▤ Built', text: '#6b3e1e' },
  inspecting: { color: 0xe9b52f, label: '◉ Inspecting', text: '#715300' },
  red: { color: 0xcd4e43, label: '⚠ Needs fix', text: '#9a2922' },
  green: { color: 0x368051, label: '✓ Green', text: '#205d34' },
};

type SegmentView = { signature: string; objects: Phaser.GameObjects.Container[] };

/** All facts draw synchronously from the reducer. Tweens only decorate status changes. */
export class YardScene extends Phaser.Scene {
  private segmentViews = new Map<string, SegmentView>();
  private house?: Phaser.GameObjects.Container;
  private epoch = -1;
  private bricks = -1;
  private family?: Family;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() { super('yard'); }

  create() {
    this.drawGround();
    this.family = new Family(this);
    this.redraw();
    const unsubscribe = store.subscribe(() => this.redraw());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      this.family?.destroy();
      this.family = undefined;
      this.tweens.killAll();
      this.segmentViews.clear();
      this.house = undefined;
      this.epoch = -1;
      this.bricks = -1;
    });
  }

  private text(x: number, y: number, value: string, size = L.type.small, color = '#213a2b') {
    return this.add.text(x, y, value, { fontFamily: L.type.font, fontSize: size, color, align: 'center' }).setOrigin(0.5);
  }

  private drawGround() {
    const g = this.add.graphics();
    g.fillStyle(0xd7dfcc).fillRect(0, 0, L.width, L.height);
    const yard = L.ground;
    g.fillStyle(0xa9c986).fillRect(yard.x, yard.y, yard.width, yard.height);
    for (let y = L.grass.step; y < L.height; y += L.grass.step) {
      for (let x = L.grass.step; x < L.width; x += L.grass.step) {
        const inside = x > yard.x && x < yard.x + yard.width && y > yard.y && y < yard.y + yard.height;
        g.fillStyle(inside ? 0x91b76d : 0xc4cfb9, 0.65);
        g.fillRect(x, y, L.grass.blade, L.grass.blade);
        g.fillRect(x + L.grass.offset, y - L.grass.blade, L.grass.blade, L.grass.blade);
      }
    }
    g.fillStyle(0xc9b692).fillRect(L.path.x, L.path.y, L.path.width, L.path.height);
    const gate = L.gate;
    g.fillStyle(0x624a34).fillRect(gate.x - gate.width / 2, gate.y - gate.height / 2, gate.width, gate.height);
    g.lineStyle(L.fence.stroke, 0xf0d6a5).strokeRect(gate.x - gate.width / 2, gate.y - gate.height / 2, gate.width, gate.height);
    this.text(L.outside.x, L.outside.y, 'OUTSIDE · everything beyond the fence', L.type.label);
    this.text(L.yardLabel.x, L.yardLabel.y, 'THE YARD', L.type.heading).setFontStyle('bold');
    this.text(gate.x, gate.labelY, 'GATE', L.type.label).setFontStyle('bold');
    this.text(L.house.x + L.house.width / 2, L.house.labelY, 'HOUSE · the website', L.type.label).setFontStyle('bold');
  }

  private redraw() {
    const state = store.getSnapshot();
    const instant = this.epoch !== state.epoch;
    if (instant) {
      this.tweens.killAll();
      for (const view of this.segmentViews.values()) view.objects.forEach(object => object.destroy());
      this.segmentViews.clear();
      this.bricks = -1;
      this.epoch = state.epoch;
    }
    const ids = new Set(state.world.segments.map(segment => segment.id));
    for (const [id, view] of this.segmentViews) {
      if (!ids.has(id)) {
        view.objects.forEach(object => { this.tweens.killTweensOf(object); object.destroy(); });
        this.segmentViews.delete(id);
      }
    }
    state.world.segments.forEach((segment, index) => {
      const signature = JSON.stringify([segment, index]);
      const previous = this.segmentViews.get(segment.id);
      if (previous?.signature === signature) return;
      previous?.objects.forEach(object => { this.tweens.killTweensOf(object); object.destroy(); });
      const slot = L.slots[index];
      if (!slot) return;
      this.segmentViews.set(segment.id, { signature, objects: this.drawSegment(segment, slot, instant) });
    });
    this.family?.sync(state.world, instant);
    if (this.bricks !== state.world.bricks) this.drawHouse(state.world);
  }

  private drawSegment(segment: Segment, slot: typeof L.slots[number], instant: boolean) {
    const style = styles[segment.status];
    const fence = this.add.container(slot.x, slot.y);
    const g = this.add.graphics();
    fence.add(g);
    if (slot.vertical) g.setRotation(Math.PI / 2);
    const f = L.fence;
    if (segment.status === 'planned') {
      g.lineStyle(f.stroke, style.color);
      for (let x = -f.length / 2; x < f.length / 2; x += f.dash + f.dashGap) {
        g.strokeRect(x, -f.thickness / 2, Math.min(f.dash, f.length / 2 - x), f.thickness);
      }
    } else {
      g.fillStyle(style.color).fillRect(-f.length / 2, -f.thickness / 2, f.length, f.thickness);
      g.lineStyle(f.stroke, 0x352d23, 0.4);
      g.lineBetween(-f.length / 2, -f.railGap, f.length / 2, -f.railGap);
      g.lineBetween(-f.length / 2, f.railGap, f.length / 2, f.railGap);
      for (let x = -f.length / 2; x <= f.length / 2; x += f.postStep) {
        g.fillStyle(style.color).fillRect(x - f.postWidth / 2, -f.postHeight / 2, f.postWidth, f.postHeight);
        g.fillStyle(0xffedc9, 0.7).fillRect(x - f.nailSize / 2, -f.railGap, f.nailSize, f.nailSize);
      }
    }
    const sign = this.add.container(slot.labelX, slot.labelY);
    const s = L.sign;
    const plate = this.add.graphics();
    plate.fillStyle(0x203523, 0.1).fillRect(-s.width / 2 + s.shadow, -s.height / 2 + s.shadow, s.width, s.height);
    plate.fillStyle(0xfffdf4).fillRect(-s.width / 2, -s.height / 2, s.width, s.height);
    plate.lineStyle(f.stroke, style.color).strokeRect(-s.width / 2, -s.height / 2, s.width, s.height);
    const title = this.text(0, s.titleY, segment.label, L.type.label).setFontStyle('bold');
    const detail = this.text(0, s.detailY, segment.detail).setWordWrapWidth(s.width - s.padding * 2, true);
    const status = this.text(0, s.statusY, style.label, L.type.small, style.text).setFontStyle('bold');
    sign.add([plate, title, detail, status]);
    // Snapshot/reset is a static redraw. Live status effects never queue or delay facts.
    if (!instant && !this.reducedMotion) {
      if (segment.status === 'inspecting') this.tweens.add({ targets: fence, alpha: 0.4, duration: 480, yoyo: true, repeat: -1 });
      if (segment.status === 'red') this.tweens.add({ targets: fence, x: slot.x + f.shake, duration: 100, yoyo: true, repeat: 5 });
    }
    return [fence, sign];
  }

  private drawHouse(world: WorldState) {
    this.house?.destroy();
    this.house = this.add.container(0, 0);
    this.bricks = world.bricks;
    const h = L.house;
    const g = this.add.graphics();
    g.fillStyle(0xe1d8c1).fillRect(h.x, h.y, h.width, h.height);
    g.lineStyle(L.fence.stroke, 0x7f806d).strokeRect(h.x, h.y, h.width, h.height);
    const count = Math.min(h.columns * h.rows, Math.max(0, Math.floor(world.bricks)));
    for (let i = 0; i < count; i++) {
      const x = h.x + h.inset + (i % h.columns) * (h.brickWidth + h.gap);
      const y = h.y + h.inset + Math.floor(i / h.columns) * (h.brickHeight + h.gap);
      // Each new piece extends the top-down roof footprint; no inferred completion.
      g.fillStyle(i % 2 ? 0xb56946 : 0xc47b51).fillRect(x, y, h.brickWidth, h.brickHeight);
      g.lineStyle(h.roofLineWidth, 0xe9a978).lineBetween(x + h.roofInset, y + h.roofLineGap, x + h.brickWidth - h.roofInset, y + h.roofLineGap);
    }
    const label = this.text(h.x + h.width / 2, h.countY, `${world.bricks} ${world.bricks === 1 ? 'brick' : 'bricks'} placed`, L.type.label).setFontStyle('bold');
    this.house.add([g, label]);
  }
}
