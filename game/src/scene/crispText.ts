import Phaser from 'phaser';

// The yard renders with pixelArt (nearest-neighbour), which suits tiles but makes text blocky once the
// canvas is scaled to fit the screen. Text is drawn at high resolution and smoothed instead.
const resolution = Math.min(4, Math.max(2, Math.ceil(window.devicePixelRatio * 2)));

export function crispText(scene: Phaser.Scene, x: number, y: number, value: string, style: Phaser.Types.GameObjects.Text.TextStyle) {
  const text = scene.add.text(x, y, value, { ...style, resolution });
  // Any later change (setText, bold, word wrap) re-renders the texture, so keep it smooth every time.
  const render = text.updateText.bind(text);
  text.updateText = () => { const result = render(); text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR); return result; };
  text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return text;
}
