# M2 art

The yard currently uses simple colored shapes. No third-party artwork is bundled.
Download Kenney **Tiny Town** (CC0): https://kenney.nl/assets/tiny-town
Choose Download, then Continue without donating if prompted. Unzip the pack into:
`game/public/assets/tiny-town/`
Keep the supplied folders and license together (e.g. `tiny-town/Tilemap/`,
`tiny-town/Tiles/`, and its license). Once the files are available, map the chosen
terrain/fence/roof tiles in YardScene.ts. Dropping files here alone does not switch
away from the fallback. Use 3–4x native pixel scale and keep Phaser pixelArt enabled.
