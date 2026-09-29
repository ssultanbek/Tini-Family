# Art assets

The 2D pixel yard (`/?view=2d`) uses two CC0 packs by Kenney (www.kenney.nl), bundled here with
their licenses:

- **Tiny Town** (`tiny-town/`): https://kenney.nl/assets/tiny-town
- **Tiny Dungeon** (`tiny-dungeon/`): https://kenney.nl/assets/tiny-dungeon

`src/scene/art.ts` loads the packed tilemaps. Keep each pack's folders and license together.
Render at 3-4x native pixel scale with Phaser's `pixelArt` enabled. The 3D yard (`/`) uses no
third-party art.
