import Phaser from 'phaser';
import type { Segment, SegmentStatus, WorldState } from '../../../shared/events.ts';
import { yardLayout as L } from '../layout.ts';
import { store } from '../store.ts';
import { Family } from './Family.ts';
import { fenceLook, frames, sheets } from './art.ts';
import { crispText } from './crispText.ts';
import { MacHouse } from './mac.ts';

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
  private mac?: MacHouse;
  private hedge?: Phaser.GameObjects.Container;
  private hedgeSignature = '';
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() { super('yard'); }

  preload() {
    this.load.spritesheet('town', sheets.town, { frameWidth: sheets.tile, frameHeight: sheets.tile });
    this.load.spritesheet('dungeon', sheets.dungeon, { frameWidth: sheets.tile, frameHeight: sheets.tile });
  }

  private tile(x: number, y: number, frame: number, size = sheets.tile * L.tileScale) {
    return this.add.image(x, y, 'town', frame).setDisplaySize(size, size);
  }

  create() {
    // The Mac strip lives at world x < 0, so the camera starts there and every yard position is unchanged.
    this.cameras.main.setScroll(-L.mac.strip, 0);
    this.drawGround();
    this.mac = new MacHouse(this);
    this.family = new Family(this, this.mac);
    this.redraw();
    const unsubscribe = store.subscribe(() => this.redraw());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      this.family?.destroy();
      this.family = undefined;
      this.tweens.killAll();
      this.segmentViews.clear();
      this.house = undefined;
      this.mac = undefined;
      this.hedge = undefined;
      this.hedgeSignature = '';
      this.epoch = -1;
      this.bricks = -1;
    });
  }

  private text(x: number, y: number, value: string, size = L.type.small, color = '#213a2b', bold = false) {
    return crispText(this, x, y, value, { fontFamily: L.type.font, fontSize: size, color, align: 'center', fontStyle: bold ? 'bold' : '' }).setOrigin(0.5);
  }

  private drawGround() {
    const size = sheets.tile * L.tileScale;
    for (let y = size / 2; y < L.height + size / 2; y += size) {
      for (let x = size / 2 - L.mac.strip; x < L.width + size / 2; x += size) {
        // Stable, hand-free variety: the same grass pattern on every load.
        const n = ((Math.floor(x / size) * 7 + Math.floor(y / size) * 13) % 23 + 23) % 23;
        this.tile(x, y, n === 0 ? frames.grassFlowers : n < 5 ? frames.grassTuft : frames.grass);
      }
    }
    for (let y = L.path.y + size / 2; y < L.height + size / 2; y += size) this.tile(L.path.x + L.path.width / 2, y, frames.dirt);
    for (const prop of L.decor) this.tile(prop.x, prop.y, prop.frame);
    const yard = L.ground;
    const g = this.add.graphics();
    g.fillStyle(0xfff7d6, 0.18).fillRect(yard.x, yard.y, yard.width, yard.height);
    const gate = L.gate;
    g.fillStyle(0x5b3b24).fillRect(gate.x - gate.width / 2, gate.y - gate.height / 2, gate.width, gate.height);
    g.lineStyle(L.fence.stroke, 0xe9c27f).strokeRect(gate.x - gate.width / 2, gate.y - gate.height / 2, gate.width, gate.height);
    this.text(L.outside.x, L.outside.y, 'OUTSIDE · everything beyond the fence', L.type.label);
    this.text(L.yardLabel.x, L.yardLabel.y, 'THE YARD', L.type.heading, undefined, true);
    this.text(gate.x, gate.labelY, 'GATE', L.type.label, undefined, true);
    this.text(L.house.x + L.house.width / 2, L.house.labelY, 'HOUSE · the project', L.type.label, undefined, true);
  }

  private redraw() {
    const state = store.getSnapshot();
    const instant = this.epoch !== state.epoch;
    if (instant) {
      this.tweens.killAll();
      for (const view of this.segmentViews.values()) view.objects.forEach(object => object.destroy());
      this.segmentViews.clear();
      this.bricks = -1;
      this.mac?.clear();
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
    this.drawHedge(state.world.segments.length);
    this.mac?.request(state.world.openEscalation?.requested ?? null);
    this.family?.sync(state.world, instant);
    if (this.bricks !== state.world.bricks) this.drawHouse(state.world);
  }

  /** Wrap sentences; break a long path at its slashes (never mid-name); shrink only what still does not fit. */
  private fitText(text: Phaser.GameObjects.Text, maxWidth: number) {
    if (text.width <= maxWidth) return text;
    const value = text.text.trim();
    if (/\s/.test(value)) return text.setWordWrapWidth(maxWidth, true);
    const parts = value.split(/(?<=\/)/);
    if (parts.length > 1) {
      const lines: string[] = [];
      for (const part of parts) {
        const line = lines.at(-1);
        if (line !== undefined && text.setText(line + part).width <= maxWidth) lines[lines.length - 1] = line + part;
        else lines.push(part);
      }
      text.setText(lines.slice(0, 2).join('\n'));
      if (text.width <= maxWidth && lines.length <= 2) return text;
    }
    return this.fitLine(text, maxWidth);
  }

  /** Keep one line (a sign title): shrink the font just enough, never below the readable minimum. */
  private fitLine(text: Phaser.GameObjects.Text, maxWidth: number) {
    if (text.width <= maxWidth) return text;
    const size = parseFloat(String(text.style.fontSize));
    // Bold canvas text renders a little wider than it measures; keep a margin so it is never clipped.
    return text.setFontSize(Math.max(L.type.minFit, Math.floor(size * maxWidth * 0.92 / text.width)));
  }

  /** A hedge seals every left-side slot (facing the Mac) that has no fence segment yet. */
  private drawHedge(segmentCount: number) {
    const open = L.slots.map((slot, index) => ({ slot, index })).filter(({ slot, index }) => slot.vertical && slot.x < L.width / 2 && index >= segmentCount);
    const signature = open.map(({ index }) => index).join();
    if (signature === this.hedgeSignature && this.hedge) return;
    this.hedgeSignature = signature;
    this.hedge?.destroy();
    this.hedge = this.add.container(0, 0).setDepth(2);
    const h = L.hedge, f = L.fence;
    for (const { slot } of open) {
      for (let d = -f.length / 2 + h.step / 2, i = 0; d <= f.length / 2 - h.step / 2 + 1; d += h.step, i++) {
        // Slight alternating offset so it reads as a thick, living hedge rather than a row of stamps.
        this.hedge.add(this.tile(slot.x + (i % 2 ? h.jitter : -h.jitter), slot.y + d, 5, h.size));
      }
    }
  }

  private drawSegment(segment: Segment, slot: typeof L.slots[number], instant: boolean) {
    const style = styles[segment.status];
    const fence = this.add.container(slot.x, slot.y);
    const f = L.fence;
    const look = fenceLook[segment.status];
    const size = sheets.tile * f.tileScale;
    const count = Math.round(f.length / size);
    if (look.glow) {
      // A soft two-layer glow under the planks: red, yellow or green is visible at a glance.
      const glow = this.add.graphics();
      const [w, h] = slot.vertical ? [size, f.length] : [f.length, size];
      glow.fillStyle(look.glow, 0.28).fillRoundedRect(-w / 2 - f.glowPad * 1.6, -h / 2 - f.glowPad * 1.6, w + f.glowPad * 3.2, h + f.glowPad * 3.2, 18);
      glow.fillStyle(look.glow, 0.45).fillRoundedRect(-w / 2 - f.glowPad, -h / 2 - f.glowPad, w + f.glowPad * 2, h + f.glowPad * 2, 12);
      fence.add(glow);
    }
    for (let i = 0; i < count; i++) {
      const offset = -f.length / 2 + size / 2 + i * size;
      const frame = slot.vertical
        ? i === 0 ? frames.fence.top : i === count - 1 ? frames.fence.bottom : frames.fence.vertical
        : i === 0 ? frames.fence.left : i === count - 1 ? frames.fence.right : i % 2 ? frames.fence.post : frames.fence.middle;
      const plank = this.add.image(slot.vertical ? 0 : offset, slot.vertical ? offset : 0, 'town', frame).setDisplaySize(size, size).setTint(look.tint);
      // Planned fences are ghosts: every other plank fainter, like a dashed outline.
      plank.setAlpha(segment.status === 'planned' ? (i % 2 ? look.alpha * 0.6 : look.alpha) : look.alpha);
      fence.add(plank);
    }
    const sign = this.add.container(slot.labelX, slot.labelY);
    const s = L.sign;
    const inner = s.width - s.padding * 2;
    // A long title wraps rather than shrinking past readable; the sign then grows to fit its lines.
    const title = this.text(0, 0, segment.label, L.type.label, undefined, true);
    if (title.width > inner) {
      if (/\s/.test(segment.label.trim())) title.setWordWrapWidth(inner, true);
      else this.fitLine(title, inner);
    }
    const detail = this.fitText(this.text(0, 0, segment.detail), inner);
    const status = this.text(0, 0, style.label, L.type.small, style.text, true);
    const lines = [title, detail, status];
    const height = Math.max(s.height, lines.reduce((sum, line) => sum + line.height, 0) + s.lineGap * 2 + s.padding * 2);
    let y = -height / 2 + s.padding;
    for (const line of lines) { line.setY(y + line.height / 2); y += line.height + s.lineGap; }
    const plate = this.add.graphics();
    plate.fillStyle(0x203523, 0.1).fillRect(-s.width / 2 + s.shadow, -height / 2 + s.shadow, s.width, height);
    plate.fillStyle(0xfffdf4).fillRect(-s.width / 2, -height / 2, s.width, height);
    plate.lineStyle(f.stroke, style.color).strokeRect(-s.width / 2, -height / 2, s.width, height);
    sign.add([plate, title, detail, status]);
    // Snapshot/reset is a static redraw. Live status effects never queue or delay facts.
    if (!instant && !this.reducedMotion) {
      if (segment.status === 'inspecting') this.tweens.add({ targets: fence, alpha: 0.55, duration: 480, yoyo: true, repeat: -1 });
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
    g.fillStyle(0x3b3027, 0.25).fillRect(h.x + 6, h.y + 6, h.width, h.height);
    const placed = Math.max(0, Math.floor(world.bricks));
    // The project keeps growing across turns: add rows and shrink tiles so every brick still fits.
    const rows = Math.min(h.maxRows, Math.max(h.rows, Math.ceil(placed / h.columns)));
    const cellWidth = (h.width - 2 * h.inset) / h.columns;
    const cellHeight = (h.height - 2 * h.inset) / rows;
    const tiles: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < h.columns * rows; i++) {
      const column = i % h.columns, row = Math.floor(i / h.columns);
      const x = h.x + h.inset + (column + 0.5) * cellWidth, y = h.y + h.inset + (row + 0.5) * cellHeight;
      // Each brick is one roof tile over the stone footprint; no inferred completion.
      const frame = i < placed ? (row === 0 ? frames.roofTop : frames.roofRow)[column] : frames.floor;
      tiles.push(this.add.image(x, y, 'town', frame).setDisplaySize(cellWidth + 0.5, cellHeight + 0.5));
    }
    g.lineStyle(L.fence.stroke, 0x3b3027).strokeRect(h.x, h.y, h.width, h.height);
    this.house.add([g, ...tiles]);
    const label = this.text(h.x + h.width / 2, h.countY, `${world.bricks} ${world.bricks === 1 ? 'brick' : 'bricks'} placed`, L.type.label, undefined, true);
    this.house.add(label);
  }
}
