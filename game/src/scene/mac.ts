import Phaser from 'phaser';
import { yardLayout as L } from '../layout.ts';
import { crispText } from './crispText.ts';
import { macRoomFor, macRooms, type MacRoomId } from './macRooms.ts';

// Stone floor-plan pieces from Tiny Town (a 3x3 frame: corners, edges, centre).
const stone = { tl: 96, t: 97, tr: 98, l: 108, c: 109, r: 110, bl: 120, b: 121, br: 122 };
type Room = { x: number; y: number; width: number; height: number };

/** "Your Mac": the rest of the computer, drawn outside the fence. Display only; it never decides anything. */
export class MacHouse {
  private rooms = new Map<MacRoomId, Room>();
  private transient: Phaser.GameObjects.GameObject[] = [];
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private scene: Phaser.Scene) {
    const m = L.mac;
    const g = scene.add.graphics().setDepth(1);
    const bottom = m.roomsY + macRooms.length * (m.roomHeight + m.roomGap) - m.roomGap;
    // The house: one outer wall around every room, with a shadow so it sits on the grass.
    g.fillStyle(0x1d2a22, 0.3).fillRect(m.x + 8, m.titleY - m.titleHeight / 2 + 8, m.width, bottom - (m.titleY - m.titleHeight / 2) + 10);
    g.fillStyle(0x4a4f5c).fillRect(m.x - m.outline, m.roomsY - m.outline, m.width + m.outline * 2, bottom - m.roomsY + m.outline * 2);
    macRooms.forEach((room, index) => {
      const y = m.roomsY + index * (m.roomHeight + m.roomGap);
      const box = { x: m.x, y, width: m.width, height: m.roomHeight };
      this.rooms.set(room.id, box);
      this.floor(box);
      scene.add.image(box.x + m.iconX, y + m.roomHeight / 2, room.sheet, room.frame).setDisplaySize(m.icon, m.icon).setDepth(2);
      this.text(box.x + m.labelX, y + m.roomHeight / 2 + m.labelY, room.label, m.labelSize, '#1f2630', true).setOrigin(0, 0.5);
      this.text(box.x + m.labelX, y + m.roomHeight / 2 + m.lockY, '🔒 locked', m.lockSize, '#4a4f5c').setOrigin(0, 0.5);
    });
    // Title plate on top of the house.
    const plate = scene.add.graphics().setDepth(2);
    plate.fillStyle(0x1f2630).fillRoundedRect(m.x - m.outline, m.titleY - m.titleHeight / 2, m.width + m.outline * 2, m.titleHeight, 10);
    this.text(m.x + m.width / 2, m.titleY - 16, 'YOUR MAC', m.titleSize, '#ffffff', true);
    this.text(m.x + m.width / 2, m.titleY + 18, 'stays outside the fence', m.subtitleSize, '#c9d1dc');
  }

  private text(x: number, y: number, value: string, size: number, color: string, bold = false) {
    return crispText(this.scene, x, y, value, { fontFamily: L.type.font, fontSize: size, color, fontStyle: bold ? 'bold' : '' }).setOrigin(0.5).setDepth(3);
  }

  private floor(room: Room) {
    const t = L.mac.tile;
    const cols = Math.round(room.width / t), rows = Math.round(room.height / t);
    const w = room.width / cols, h = room.height / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const edgeX = col === 0 ? 'l' : col === cols - 1 ? 'r' : '';
        const edgeY = row === 0 ? 't' : row === rows - 1 ? 'b' : '';
        const key = (edgeY + edgeX || 'c') as keyof typeof stone;
        this.scene.add.image(room.x + (col + 0.5) * w, room.y + (row + 0.5) * h, 'town', stone[key]).setDisplaySize(w + 0.5, h + 0.5).setDepth(1);
      }
    }
  }

  /** A blocked attempt (fence.blocked) visibly aims at the matching room: dotted line + red flash. */
  aim(target: string, from: { x: number; y: number }) {
    const id = macRoomFor(target);
    const room = id && this.rooms.get(id);
    if (!room) return;
    const m = L.mac;
    const to = { x: room.x + room.width, y: room.y + room.height / 2 };
    const line = this.scene.add.graphics().setDepth(21);
    const length = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
    for (let d = 0; d <= length; d += m.dot.step) {
      const p = d / length;
      line.fillStyle(d % (m.dot.step * 2) ? 0xffc53d : 0xe0362c).fillCircle(from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p, m.dot.radius);
    }
    const flash = this.scene.add.graphics().setDepth(4);
    flash.fillStyle(0xe0362c, 0.35).fillRect(room.x, room.y, room.width, room.height);
    flash.lineStyle(5, 0xe0362c).strokeRect(room.x, room.y, room.width, room.height);
    const stamp = this.text(room.x + room.width - 12, room.y + 16, 'BLOCKED', L.type.small, '#ffffff', true).setOrigin(1, 0.5)
      .setBackgroundColor('#c62f26').setPadding(6, 2, 6, 2).setDepth(5);
    const parts = [line, flash, stamp];
    this.transient.push(...parts);
    const done = () => { for (const part of parts) part.destroy(); this.transient = this.transient.filter(part => !parts.includes(part as never)); };
    if (this.reducedMotion) { this.scene.time.delayedCall(m.flashMs, done); return; }
    this.scene.tweens.add({ targets: parts, alpha: { from: 1, to: 0 }, delay: m.flashMs * 0.55, duration: m.flashMs * 0.45, onComplete: done });
  }

  /** Snapshots and resets redraw instantly: drop any pointer still on screen. */
  clear() {
    for (const part of this.transient) part.destroy();
    this.transient = [];
  }
}
