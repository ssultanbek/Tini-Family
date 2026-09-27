/* The yard in 3D. Everything here is built from simple shapes in code: the island, the fence,
   the brick house, Tini, Tina, the Agent, the paper plane and the sparks.
   It plugs into site.js as a renderer: set(state) gives it a target state (the same one the SVG
   uses) and the scene animates toward it. Falls back to the SVG when WebGL is missing or the
   visitor prefers reduced motion. */
import * as THREE from "three";

const site = window.TiniSite;
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) { return false; }
}

/* ---------------- palette (style guide + yard) ---------------- */
const COL = {
  sky: 0xE2F0F9, grass: 0xCFE8B9, lawn: 0xDDF0CC, grassSide: 0x9FCB88, soil: 0xC9A27A, soilDark: 0xA87E57,
  wood: 0xA8733F, woodCap: 0x8A5A36, rail: 0xC08A55, red: 0xC8322F, redCap: 0xA3262A, green: 0x23824A,
  plan: 0x9A97A6, brick: 0xEBDCC4, brick2: 0xE0CCAE, roof: 0x9C6A43, roofDark: 0x7E5234, door: 0x6B3F1F,
  glass: 0xB3D5EC, white: 0xFFFFFF, ink: 0x1B1A24, navy: 0x3E3C58, skin: 0xF2CAA8, blush: 0xEFA394,
  cream: 0xF4EEE4, vest: 0xB97A45, cap: 0x2E6590, coat: 0x7FB4DB, hair: 0x4A2E1E, boot: 0x5A3A22,
  fur: 0x3F6FD8, furDark: 0x3560C2, face: 0x6F95EA, eye: 0x0F1733, mark: 0xF1E6CC, collar: 0x1D5A85, tag: 0xDDC3A7, metal: 0x6E6A7E,
  tree: 0x8CC47A, tree2: 0x76B566, trunk: 0x8A5A36, spark: 0xD39A00, path: 0xE9DCC6, stone: 0xD8D2C4,
};

const matCache = new Map();
function mat(color, opts) {
  const key = color + (opts ? JSON.stringify(opts) : "");
  if (!opts && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.86, metalness: 0 }, opts || {}));
  if (!opts) matCache.set(key, m);
  return m;
}
function mesh(geo, material, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
function angleLerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }
function onRing(r, a, y = 0) { return new THREE.Vector3(r * Math.sin(a), y, r * Math.cos(a)); }

/* ---------------- geometry constants ---------------- */
const CH = 1.35; // character scale
const ISLAND_R = 8.8, FENCE_R = 6.4, N = 30, SEGS = 5, PER = N / SEGS;
const postAngle = (i) => -((i + 0.5) / N) * Math.PI * 2; // i=0 front-left of the gate, goes left, back, right
const segMid = (k) => postAngle(k * PER + PER / 2 - 0.5);

const HOUSE = { x: 0, z: -0.9, w: 3.6, d: 2.4, rows: 8, bl: 0.45, bh: 0.24, bd: 0.3 };

/* ---------------- characters ---------------- */
function limb(radius, length, color, pivotPos) {
  const pivot = new THREE.Group();
  pivot.position.copy(pivotPos);
  const m = mesh(new THREE.CapsuleGeometry(radius, length, 4, 10), mat(color));
  m.position.y = -length / 2 - radius * 0.3;
  pivot.add(m);
  return pivot;
}
function face(g, y, z, withSmile = true) {
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.038, 10, 8), mat(COL.ink), false);
    eye.position.set(0.1 * s, y, z);
    g.add(eye);
    const cheek = mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(COL.blush, { transparent: true, opacity: 0.55 }), false);
    cheek.scale.set(1, 0.7, 0.4);
    cheek.position.set(0.17 * s, y - 0.08, z - 0.03);
    g.add(cheek);
  }
  if (withSmile) {
    const smile = mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 14, Math.PI), mat(COL.ink), false);
    smile.rotation.z = Math.PI;
    smile.position.set(0, y - 0.1, z + 0.005);
    g.add(smile);
  }
}

function makeTini() {
  const g = new THREE.Group();
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = limb(0.1, 0.34, COL.navy, new THREE.Vector3(0.12 * s, 0.58, 0));
    const boot = mesh(new THREE.BoxGeometry(0.19, 0.1, 0.28), mat(COL.boot));
    boot.position.set(0, -0.55, 0.04);
    leg.add(boot);
    g.add(leg); legs.push(leg);
  }
  const torso = mesh(new THREE.CapsuleGeometry(0.28, 0.32, 4, 14), mat(COL.cream));
  torso.position.y = 0.96; g.add(torso);
  const vest = mesh(new THREE.CylinderGeometry(0.3, 0.315, 0.5, 20, 1, true, 0.42, Math.PI * 2 - 0.84), mat(COL.vest, { side: THREE.DoubleSide }));
  vest.position.y = 0.92; g.add(vest);
  const pocketL = mesh(new THREE.BoxGeometry(0.1, 0.08, 0.03), mat(0x9C6436), false);
  pocketL.position.set(-0.17, 0.84, 0.26); pocketL.rotation.y = -0.5; g.add(pocketL);
  const pocketR = pocketL.clone(); pocketR.position.x = 0.17; pocketR.rotation.y = 0.5; g.add(pocketR);

  const armL = limb(0.075, 0.3, COL.cream, new THREE.Vector3(-0.34, 1.2, 0));
  armL.rotation.z = -0.12;
  const handL = mesh(new THREE.SphereGeometry(0.08, 10, 8), mat(COL.skin)); handL.position.y = -0.45; armL.add(handL);
  const armR = limb(0.075, 0.3, COL.cream, new THREE.Vector3(0.34, 1.2, 0));
  const handR = mesh(new THREE.SphereGeometry(0.08, 10, 8), mat(COL.skin)); handR.position.y = -0.45; armR.add(handR);
  const hammer = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.52, 8), mat(COL.trunk));
  handle.position.y = 0.2;
  const head = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), mat(COL.metal, { roughness: 0.5, metalness: 0.2 }));
  head.position.set(0, 0.44, 0.05);
  hammer.add(handle, head);
  hammer.position.y = -0.46; hammer.rotation.x = Math.PI / 2;
  armR.add(hammer);
  g.add(armL, armR);

  const headG = new THREE.Group(); headG.position.y = 1.6; g.add(headG);
  headG.add(mesh(new THREE.SphereGeometry(0.3, 22, 16), mat(COL.skin)));
  for (const s of [-1, 1]) { const ear = mesh(new THREE.SphereGeometry(0.07, 10, 8), mat(COL.skin)); ear.position.set(0.29 * s, 0, 0); headG.add(ear); }
  const cap = mesh(new THREE.SphereGeometry(0.315, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(COL.cap));
  cap.position.y = 0.04; cap.rotation.x = -0.12; headG.add(cap);
  const brim = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.035, 18, 1, false, -Math.PI / 2, Math.PI), mat(0x24557A));
  brim.position.set(0, 0.07, 0.22); brim.scale.set(1.1, 1, 1); headG.add(brim);
  const button = mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0x24557A)); button.position.y = 0.34; headG.add(button);
  const tache = mesh(new THREE.CapsuleGeometry(0.03, 0.12, 3, 8), mat(COL.boot), false);
  tache.rotation.z = Math.PI / 2; tache.position.set(0, -0.06, 0.29); headG.add(tache);
  face(headG, 0.03, 0.275);
  return { g, legs, armL, armR, head: headG, hammer };
}

function makeTina() {
  const g = new THREE.Group();
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = limb(0.075, 0.34, COL.navy, new THREE.Vector3(0.1 * s, 0.52, 0));
    const shoe = mesh(new THREE.BoxGeometry(0.16, 0.09, 0.24), mat(COL.collar));
    shoe.position.set(0, -0.5, 0.03); leg.add(shoe);
    g.add(leg); legs.push(leg);
  }
  const coat = mesh(new THREE.CylinderGeometry(0.25, 0.43, 0.78, 22), mat(COL.coat));
  coat.position.y = 0.8; g.add(coat);
  const shoulders = mesh(new THREE.SphereGeometry(0.27, 18, 12), mat(COL.coat));
  shoulders.scale.set(1.05, 0.7, 0.95); shoulders.position.y = 1.18; g.add(shoulders);
  const collar = mesh(new THREE.ConeGeometry(0.12, 0.14, 3), mat(COL.white), false);
  collar.rotation.x = Math.PI; collar.position.set(0, 1.26, 0.2); g.add(collar);
  for (const y of [0.95, 0.75]) { const b = mesh(new THREE.SphereGeometry(0.028, 8, 6), mat(COL.collar), false); b.position.set(0.06, y, 0.3 + (0.95 - y) * 0.22); g.add(b); }

  const armL = limb(0.07, 0.3, COL.coat, new THREE.Vector3(-0.3, 1.2, 0));
  const handL = mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(COL.skin)); handL.position.y = -0.44; armL.add(handL);
  const board = new THREE.Group();
  const clip = mesh(new THREE.BoxGeometry(0.3, 0.38, 0.03), mat(COL.vest));
  const paper = mesh(new THREE.BoxGeometry(0.24, 0.3, 0.01), mat(COL.white), false); paper.position.z = 0.02;
  const clipTop = mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), mat(COL.metal), false); clipTop.position.set(0, 0.18, 0.02);
  board.add(clip, paper, clipTop);
  board.position.set(0.05, -0.5, 0.14); board.rotation.set(-0.5, 0.3, 0);
  armL.add(board);
  armL.rotation.set(-0.7, 0, -0.1);

  const armR = limb(0.07, 0.3, COL.coat, new THREE.Vector3(0.3, 1.2, 0));
  const handR = mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(COL.skin)); handR.position.y = -0.44; armR.add(handR);
  const glass = new THREE.Group();
  const ring = mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 24), mat(0x53505C, { roughness: 0.5 }));
  const lens = mesh(new THREE.CircleGeometry(0.12, 24), mat(COL.glass, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.2 }), false);
  const stick = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.26, 8), mat(COL.boot));
  stick.position.y = -0.25;
  ring.position.y = -0.0; lens.position.y = 0;
  glass.add(ring, lens, stick);
  glass.position.set(0, -0.36, 0.16);
  glass.rotation.x = -0.2;
  const glassPivot = new THREE.Group(); glassPivot.add(glass); glassPivot.position.y = -0.3;
  glass.position.set(0, -0.2, 0.05);
  armR.add(glassPivot);
  g.add(armL, armR);

  const headG = new THREE.Group(); headG.position.y = 1.56; g.add(headG);
  headG.add(mesh(new THREE.SphereGeometry(0.3, 22, 16), mat(COL.skin)));
  const hair = mesh(new THREE.SphereGeometry(0.325, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(COL.hair));
  hair.rotation.x = -0.62; hair.position.set(0, 0.02, -0.02); headG.add(hair);
  const bun = mesh(new THREE.SphereGeometry(0.13, 14, 10), mat(COL.hair)); bun.position.set(0, 0.33, -0.08); headG.add(bun);
  for (const s of [-1, 1]) {
    const rim = mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 18), mat(COL.ink), false);
    rim.position.set(0.1 * s, 0.02, 0.285); headG.add(rim);
  }
  const bridge = mesh(new THREE.BoxGeometry(0.06, 0.014, 0.014), mat(COL.ink), false); bridge.position.set(0, 0.03, 0.3); headG.add(bridge);
  face(headG, 0.02, 0.285);
  return { g, legs, armL, armR, head: headG, glass: glassPivot };
}

/* Gives a smooth geometry a soft, fuzzy surface (small bumps along the normals). */
function fuzz(geo, amount) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = (Math.sin(x * 41.3 + y * 17.9) * Math.cos(z * 33.7 - y * 12.1) + Math.sin((x + z) * 57.1 + y * 23.3)) * 0.5;
    p.setXYZ(i, x + n.getX(i) * k * amount, y + n.getY(i) * k * amount, z + n.getZ(i) * k * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

/* THE AGENT (Claude Code): our own fuzzy character, same as in the app. Soft blue capsule body,
   face window, stubby arms and legs, a terminal-prompt mark on the chest. */
function makeAgent() {
  const g = new THREE.Group();
  const rig = new THREE.Group(); rig.scale.setScalar(1.15); g.add(rig);
  const fur = mat(COL.fur, { roughness: 1 }), furDark = mat(COL.furDark, { roughness: 1 });
  const legs = [];
  for (const x of [-0.17, 0.17]) {
    const leg = new THREE.Group(); leg.position.set(x, 0.28, 0);
    const m = mesh(fuzz(new THREE.CapsuleGeometry(0.11, 0.1, 4, 12), 0.012), furDark); m.position.y = -0.12; leg.add(m);
    rig.add(leg); legs.push(leg);
  }
  const torso = mesh(fuzz(new THREE.CapsuleGeometry(0.36, 0.5, 10, 28), 0.018), fur);
  torso.position.y = 0.72; torso.scale.z = 0.88; rig.add(torso);
  const arms = [];
  for (const x of [-0.4, 0.4]) {
    const arm = new THREE.Group(); arm.position.set(x, 0.86, 0);
    const m = mesh(fuzz(new THREE.CapsuleGeometry(0.1, 0.24, 4, 12), 0.012), furDark); m.position.y = -0.2; m.rotation.z = x < 0 ? -0.12 : 0.12; arm.add(m);
    rig.add(arm); arms.push(arm);
  }
  const head = new THREE.Group(); head.position.set(0, 1.02, 0.25); rig.add(head);
  const win = mesh(new THREE.SphereGeometry(0.24, 24, 16), mat(COL.face, { roughness: 0.8 }), false); win.scale.set(1, 0.72, 0.4); head.add(win);
  for (const x of [-0.08, 0.08]) {
    const eye = mesh(new THREE.SphereGeometry(0.03, 12, 10), mat(COL.eye, { roughness: 0.35 }), false); eye.position.set(x, 0.02, 0.085); head.add(eye);
    const glint = mesh(new THREE.SphereGeometry(0.009, 6, 5), mat(COL.white), false); glint.position.set(x + 0.01, 0.032, 0.11); head.add(glint);
  }
  const smile = mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 14, Math.PI), mat(COL.eye), false);
  smile.rotation.z = Math.PI; smile.position.set(0, -0.05, 0.09); head.add(smile);
  const mark = new THREE.Group(); mark.position.set(0, 0.6, 0.325); rig.add(mark);
  const cream = mat(COL.mark, { roughness: 0.7 });
  const c1 = mesh(new THREE.BoxGeometry(0.1, 0.035, 0.02), cream, false); c1.position.set(-0.07, 0.03, 0); c1.rotation.z = -0.7;
  const c2 = mesh(new THREE.BoxGeometry(0.1, 0.035, 0.02), cream, false); c2.position.set(-0.07, -0.03, 0); c2.rotation.z = 0.7;
  const c3 = mesh(new THREE.BoxGeometry(0.12, 0.035, 0.02), cream, false); c3.position.set(0.07, -0.06, 0);
  mark.add(c1, c2, c3);
  const brick = mesh(new THREE.BoxGeometry(0.36, 0.17, 0.2), mat(COL.brick2)); brick.position.set(0, 0.62, 0.52); rig.add(brick);
  return { g, body: rig, legs, arms, head, brick };
}

/* Speech bubble drawn on a canvas, used for Tina's sneeze. */
function makeBubble(text, ink, line) {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 120;
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.strokeStyle = line; x.lineWidth = 5;
  x.beginPath(); x.roundRect(6, 6, 308, 84, 42); x.fill(); x.stroke();
  x.beginPath(); x.moveTo(140, 88); x.lineTo(160, 114); x.lineTo(178, 88); x.fill(); x.stroke();
  x.fillRect(138, 80, 42, 10);
  x.fillStyle = ink; x.font = "800 46px 'Manrope Variable', system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(text, 160, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.5, 0.56, 1);
  s.renderOrder = 10;
  return s;
}

/* ---------------- the world ---------------- */
function buildWorld(scene) {
  const W = {};

  // Island
  const top = mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R * 0.985, 0.4, 72), [mat(COL.grassSide), mat(COL.grass), mat(COL.grassSide)]);
  top.position.y = -0.2; scene.add(top);
  const soilGeo = new THREE.CylinderGeometry(ISLAND_R * 0.975, 3.4, 3, 40, 4);
  const pos = soilGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 1.49) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const k = 1 + 0.07 * Math.sin(a * 5 + y * 2) + 0.04 * Math.sin(a * 11);
      pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k);
      pos.setY(i, y - (y < -1 ? 0.25 * Math.sin(a * 3) : 0));
    }
  }
  soilGeo.computeVertexNormals();
  const soil = mesh(soilGeo, mat(COL.soil, { flatShading: true }), false);
  soil.position.y = -1.9; scene.add(soil);
  const soilBand = mesh(new THREE.CylinderGeometry(ISLAND_R * 0.985, ISLAND_R * 0.975, 0.3, 72), mat(COL.soilDark), false);
  soilBand.position.y = -0.53; scene.add(soilBand);

  const lawn = mesh(new THREE.CircleGeometry(FENCE_R - 0.3, 64), mat(COL.lawn), false);
  lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.005; scene.add(lawn);
  // stepping stones from the gate to the door
  for (let i = 0; i < 6; i++) {
    const st = mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.05, 10), mat(COL.stone), false);
    st.position.set(Math.sin(i * 1.3) * 0.15, 0.02, FENCE_R + 0.3 - i * 0.95);
    st.scale.set(1, 1, 0.75);
    scene.add(st);
  }

  // Trees and bushes, outside the fence
  const crown = new THREE.IcosahedronGeometry(0.85, 0);
  for (const [a, r, s] of [[-1.25, 7.7, 1.15], [-2.35, 7.6, 1], [2.3, 7.7, 1.1], [2.05, 8.0, 0.8], [-2.9, 7.4, 0.8], [2.95, 7.6, 0.75]]) {
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 8), mat(COL.trunk)); trunk.position.y = 0.5; t.add(trunk);
    const c1 = mesh(crown, mat(COL.tree2, { flatShading: true })); c1.position.y = 1.55; t.add(c1);
    const c2 = mesh(crown, mat(COL.tree, { flatShading: true })); c2.position.set(-0.3, 1.9, 0.25); c2.scale.setScalar(0.7); t.add(c2);
    const c3 = mesh(crown, mat(COL.tree, { flatShading: true })); c3.position.set(0.35, 1.3, 0.3); c3.scale.setScalar(0.55); t.add(c3);
    t.position.copy(onRing(r, a)); t.scale.setScalar(s); t.rotation.y = a * 3;
    scene.add(t);
  }
  const bushGeo = new THREE.IcosahedronGeometry(0.42, 1);
  for (const [a, r] of [[-0.62, 7.9], [0.75, 8.0], [-1.9, 8.1], [2.45, 8.25], [-0.25, 8.3], [0.35, 8.25]]) {
    const b = mesh(bushGeo, mat(COL.tree, { flatShading: true }));
    b.position.copy(onRing(r, a, 0.18)); b.scale.set(1.1, 0.8, 1); scene.add(b);
  }
  // little white flowers
  const flowerGeo = new THREE.SphereGeometry(0.06, 6, 5);
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39, r = 3.2 + ((i * 37) % 23) / 10;
    const fl = mesh(flowerGeo, mat(i % 3 ? COL.white : 0xECE8FC), false);
    fl.position.copy(onRing(r, a, 0.05));
    if (Math.abs(fl.position.x) < 2.3 && fl.position.z < 0.6 && fl.position.z > -2.4) continue;
    if (Math.abs(fl.position.x) < 0.6 && fl.position.z > 0) continue;
    scene.add(fl);
  }

  // Clouds
  W.clouds = [];
  const puff = new THREE.SphereGeometry(1, 14, 10);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
  for (const [x, y, z, s] of [[-12, 6.5, -12, 1.3], [9, 8, -14, 1.1], [16, 5, -8, 0.9], [-5, 9.5, -18, 1]]) {
    const c = new THREE.Group();
    for (const [dx, dy, sc] of [[0, 0, 1], [1.2, -0.2, 0.75], [-1.1, -0.25, 0.7], [0.4, 0.45, 0.7]]) {
      const p = new THREE.Mesh(puff, cloudMat); p.position.set(dx, dy, 0); p.scale.set(sc * 1.3, sc * 0.75, sc); c.add(p);
    }
    c.position.set(x, y, z); c.scale.setScalar(s); scene.add(c); W.clouds.push(c);
  }

  /* Fence: 5 segments, each with its own materials so it can turn red or green. */
  W.segs = [];
  const postGeo = new THREE.BoxGeometry(0.2, 1.05, 0.2); postGeo.translate(0, 0.525, 0);
  const capGeo = new THREE.ConeGeometry(0.17, 0.2, 4); capGeo.rotateY(Math.PI / 4); capGeo.translate(0, 1.15, 0);
  for (let k = 0; k < SEGS; k++) {
    const seg = { group: new THREE.Group(), posts: [], rails: [], p: 0, target: 0, color: new THREE.Color(COL.rail), mode: "wood", wobble: 0 };
    seg.postMat = mat(COL.wood, { roughness: 0.9 });
    seg.capMat = mat(COL.woodCap, { roughness: 0.9 });
    seg.railMat = mat(COL.rail, { roughness: 0.9 });
    for (let j = 0; j < PER; j++) {
      const i = k * PER + j;
      const post = new THREE.Group();
      post.add(mesh(postGeo, seg.postMat), mesh(capGeo, seg.capMat));
      post.position.copy(onRing(FENCE_R, postAngle(i)));
      post.rotation.y = postAngle(i);
      post.scale.set(1, 0.001, 1);
      seg.group.add(post); seg.posts.push(post);
      if (i + 1 < N) {
        const a = onRing(FENCE_R, postAngle(i)), b = onRing(FENCE_R, postAngle(i + 1));
        const len = a.distanceTo(b);
        const rail = new THREE.Group();
        for (const y of [0.38, 0.78]) {
          const r = mesh(new THREE.BoxGeometry(len, 0.12, 0.08), seg.railMat);
          r.position.set(len / 2, y, 0); rail.add(r);
        }
        rail.position.copy(a);
        rail.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
        rail.scale.set(0.001, 1, 1);
        seg.group.add(rail); seg.rails.push(rail);
      }
    }
    scene.add(seg.group);
    W.segs.push(seg);
  }
  // Gate: a closed picket gate between the last and the first post, facing the path
  {
    const a = onRing(FENCE_R, postAngle(N - 1)), b = onRing(FENCE_R, postAngle(0));
    const gate = new THREE.Group();
    const span = a.distanceTo(b) - 0.24, half = span / 2 - 0.03;
    for (const side of [-1, 1]) {
      const leaf = new THREE.Group();
      for (let p = 0; p < 3; p++) {
        const picket = mesh(new THREE.BoxGeometry(0.13, 0.82, 0.06), mat(COL.rail));
        picket.position.set((p + 0.5) * (half / 3), 0.46, 0);
        const tip = mesh(new THREE.ConeGeometry(0.09, 0.12, 4), mat(COL.rail), false);
        tip.rotation.y = Math.PI / 4; tip.position.set(picket.position.x, 0.93, 0);
        leaf.add(picket, tip);
      }
      for (const y of [0.3, 0.66]) {
        const slat = mesh(new THREE.BoxGeometry(half, 0.09, 0.07), mat(COL.woodCap), false);
        slat.position.set(half / 2, y, 0.05); leaf.add(slat);
      }
      leaf.position.x = side < 0 ? -span / 2 : span / 2;
      leaf.scale.x = side < 0 ? 1 : -1;
      gate.add(leaf);
    }
    gate.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
    gate.rotation.y = -Math.atan2(a.z - b.z, a.x - b.x);
    gate.scale.set(1, 0.001, 1);
    scene.add(gate);
    W.gate = gate;
  }
  // Tini's plan: a ghost ring of posts and a dashed line on the grass
  {
    const ghost = new THREE.Group();
    const gMat = new THREE.MeshStandardMaterial({ color: COL.plan, transparent: true, opacity: 0, roughness: 1, depthWrite: false });
    for (let i = 0; i < N; i++) {
      const p = new THREE.Mesh(postGeo, gMat); p.position.copy(onRing(FENCE_R, postAngle(i))); p.rotation.y = postAngle(i); ghost.add(p);
    }
    const pts = [];
    for (let i = 0; i <= 128; i++) pts.push(onRing(FENCE_R, (i / 128) * Math.PI * 2, 0.03));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineDashedMaterial({ color: 0x5A5766, dashSize: 0.3, gapSize: 0.22, transparent: true, opacity: 0 });
    const line = new THREE.Line(lineGeo, lineMat); line.computeLineDistances(); ghost.add(line);
    scene.add(ghost);
    W.ghost = { group: ghost, mats: [gMat, lineMat], o: 0 };
  }

  /* House: bricks as one instanced mesh, dropped in order. */
  {
    const H = HOUSE, slots = [];
    const x0 = H.x - H.w / 2, z0 = H.z - H.d / 2;
    const front = Math.round(H.w / H.bl), side = Math.round((H.d - 2 * H.bd) / H.bl);
    for (let r = 0; r < H.rows; r++) {
      const y = H.bh / 2 + r * H.bh;
      for (let c = 0; c < front; c++) {
        const isDoor = (c === 3 || c === 4) && r < 5;
        const isWin = (c === 1 || c === 6) && (r === 4 || r === 5);
        if (!isDoor && !isWin) slots.push({ x: x0 + H.bl * (c + 0.5), y, z: H.z + H.d / 2 - H.bd / 2, ry: 0, face: "front" });
      }
      for (let c = 0; c < side; c++) {
        const isWin = (c === 1 || c === 2) && (r === 4 || r === 5);
        if (!isWin) slots.push({ x: x0 + H.w - H.bd / 2, y, z: H.z + H.d / 2 - H.bd - H.bl * (c + 0.5), ry: Math.PI / 2, face: "right" });
      }
      for (let c = front - 1; c >= 0; c--) slots.push({ x: x0 + H.bl * (c + 0.5), y, z: z0 + H.bd / 2, ry: 0, face: "back" });
      for (let c = side - 1; c >= 0; c--) slots.push({ x: x0 + H.bd / 2, y, z: H.z + H.d / 2 - H.bd - H.bl * (c + 0.5), ry: Math.PI / 2, face: "left" });
    }
    const geo = new THREE.BoxGeometry(H.bl * 0.94, H.bh * 0.88, H.bd * 0.94);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), slots.length);
    im.castShadow = true; im.receiveShadow = true;
    const c1 = new THREE.Color(COL.brick), c2 = new THREE.Color(COL.brick2);
    slots.forEach((s, i) => im.setColorAt(i, (i * 7) % 5 < 2 ? c2 : c1));
    im.count = 0;
    scene.add(im);
    // interior floor, so the gaps look like mortar
    const floor = mesh(new THREE.BoxGeometry(H.w - 0.1, 0.06, H.d - 0.1), mat(COL.stone), false);
    floor.position.set(H.x, 0.03, H.z); scene.add(floor);
    const pad = mesh(new THREE.BoxGeometry(H.w + 0.5, 0.05, H.d + 0.5), mat(0xD9CFBE), false);
    pad.position.set(H.x, 0.02, H.z); scene.add(pad);
    const innerGeo = new THREE.BoxGeometry(H.w - 0.62, H.rows * H.bh - 0.02, H.d - 0.62); innerGeo.translate(0, (H.rows * H.bh) / 2, 0);
    const inner = mesh(innerGeo, mat(0xC9B797), false);
    inner.position.set(H.x, 0, H.z);
    inner.scale.y = 0.001; scene.add(inner);

    const door = mesh(new THREE.BoxGeometry(H.bl * 2 - 0.04, H.bh * 5 - 0.02, 0.08), mat(COL.door));
    door.position.set(x0 + H.bl * 4, (H.bh * 5) / 2, H.z + H.d / 2 - 0.2);
    const knob = mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(COL.tag, { metalness: 0.3, roughness: 0.4 }), false); knob.position.set(0.28, 0, 0.06); door.add(knob);
    door.scale.set(1, 0.001, 1); scene.add(door);
    const wins = [];
    for (const [x, z, ry] of [[x0 + H.bl * 1.5, H.z + H.d / 2 - H.bd / 2, 0], [x0 + H.bl * 6.5, H.z + H.d / 2 - H.bd / 2, 0], [x0 + H.w - H.bd / 2, H.z + H.d / 2 - H.bd - H.bl * 2, Math.PI / 2]]) {
      const w = new THREE.Group();
      const frame = mesh(new THREE.BoxGeometry(ry ? 0.86 : H.bl * 0.98, H.bh * 2, 0.26), mat(COL.white), false);
      const pane = mesh(new THREE.BoxGeometry(ry ? 0.7 : H.bl * 0.72, H.bh * 1.6, 0.28), mat(COL.glass, { roughness: 0.3 }), false);
      w.add(frame, pane);
      w.position.set(x, H.bh * 5, z); w.rotation.y = ry; w.scale.setScalar(0.001);
      scene.add(w); wins.push(w);
    }

    // Roof: a triangular prism plus a chimney
    const roof = new THREE.Group();
    const shape = new THREE.Shape();
    const rw = H.w / 2 + 0.35, rh = 1.35;
    shape.moveTo(-rw, 0); shape.lineTo(0, rh); shape.lineTo(rw, 0); shape.lineTo(-rw, 0);
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: H.d + 0.5, bevelEnabled: false });
    roofGeo.translate(0, 0, -(H.d + 0.5) / 2);
    const roofM = mesh(roofGeo, [mat(COL.roofDark), mat(COL.roof)]);
    roof.add(roofM);
    const eave = mesh(new THREE.BoxGeometry(H.w + 0.8, 0.08, H.d + 0.62), mat(COL.roofDark));
    eave.position.y = 0.02; roof.add(eave);
    const chim = mesh(new THREE.BoxGeometry(0.34, 0.8, 0.34), mat(COL.roofDark)); chim.position.set(0.9, 0.9, -0.4); roof.add(chim);
    const round = mesh(new THREE.CircleGeometry(0.22, 20), mat(COL.white), false); round.position.set(0, 0.62, (H.d + 0.5) / 2 + 0.01); roof.add(round);
    const roundIn = mesh(new THREE.CircleGeometry(0.15, 20), mat(COL.glass), false); roundIn.position.set(0, 0.62, (H.d + 0.5) / 2 + 0.02); roof.add(roundIn);
    // flag: shows when the site launches
    const flag = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), mat(COL.ink)); pole.position.y = 0.55; flag.add(pole);
    const clothGeo = new THREE.PlaneGeometry(0.62, 0.36, 8, 1); clothGeo.translate(0.31, 0, 0);
    const cloth = mesh(clothGeo, mat(COL.green, { side: THREE.DoubleSide }), false); cloth.position.y = 0.9; flag.add(cloth);
    flag.position.set(0, rh - 0.02, 0.2); flag.scale.set(1, 0.001, 1); roof.add(flag);
    roof.position.set(H.x, H.rows * H.bh, H.z);
    roof.visible = false;
    scene.add(roof);

    // the brick pile the Agent carries from
    const pile = new THREE.Group();
    const pileGeo = new THREE.BoxGeometry(0.36, 0.17, 0.2);
    for (let i = 0; i < 7; i++) {
      const b = mesh(pileGeo, mat(i % 2 ? COL.brick : COL.brick2));
      const row = i < 4 ? 0 : i < 6 ? 1 : 2, idx = i < 4 ? i : i < 6 ? i - 4 : 0;
      b.position.set((idx - (row === 0 ? 1.5 : row === 1 ? 0.5 : 0)) * 0.38, 0.09 + row * 0.17, 0);
      pile.add(b);
    }
    pile.position.set(3.4, 0, 1.2); pile.rotation.y = -0.5;
    scene.add(pile);

    W.house = { im, slots, cur: 0, target: 0, door, wins, inner, roof, roofP: 0, roofTarget: 0, flag, cloth, flagP: 0, flagTarget: 0, pile };
  }

  /* Characters */
  W.tini = makeTini(); W.tina = makeTina(); W.agent = makeAgent();
  scene.add(W.tini.g, W.tina.g, W.agent.g);
  W.tini.g.scale.setScalar(CH); W.tina.g.scale.setScalar(CH); W.agent.g.scale.setScalar(CH);
  W.tini.angle = -0.28; W.tini.g.position.copy(onRing(7.35, W.tini.angle));
  W.tina.angle = 1.3; W.tina.g.position.copy(onRing(7.45, W.tina.angle));
  W.agent.g.position.set(2.4, 0, 1.6);
  W.agent.leg = "toWall"; W.agent.dest = new THREE.Vector3(2.4, 0, 1.6); W.agent.slot = 0;
  W.bubble = makeBubble("Achoo!", "#A3262A", "#F3BDB7");
  W.bubble.visible = false;
  scene.add(W.bubble);

  /* The paper plane and its sparks */
  {
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([
      0, 0, 0.55, -0.5, 0.06, -0.4, 0, -0.02, -0.3,
      0, 0, 0.55, 0, -0.02, -0.3, 0.5, 0.06, -0.4,
      0, 0, 0.55, 0, -0.02, -0.3, 0, -0.16, -0.32,
    ]);
    g.setAttribute("position", new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    const plane = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.7, flatShading: true, transparent: true }));
    plane.castShadow = true; plane.visible = false;
    plane.scale.setScalar(0.9);
    scene.add(plane);
    const sparks = [];
    const sGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const sMat = new THREE.MeshBasicMaterial({ color: COL.spark });
    for (let i = 0; i < 18; i++) { const s = new THREE.Mesh(sGeo, sMat); s.visible = false; scene.add(s); sparks.push({ m: s, v: new THREE.Vector3(), life: 0 }); }
    const hitA = segMid(3) + 0.2;
    W.plane = { m: plane, sparks, t: -1, dur: 1.0, state: null, from: new THREE.Vector3(13, 5.5, -7), hit: onRing(FENCE_R + 0.35, hitA, 0.75), fall: 0 };
  }
  return W;
}

/* ---------------- renderer (one per stage) ---------------- */
const CAMS = {
  hero: { az: 0.3, el: 0.5, dist: 21.5, look: [0, 0.4, 0.4] },
  1: { az: -0.35, el: 0.5, dist: 24, look: [0, 0.6, 0] },
  2: { az: 0.0, el: 0.95, dist: 25, look: [0, 0, 0.3] },
  3: { az: 0.42, el: 0.44, dist: 21, look: [0.9, 0.7, -0.2] },
  4: { az: 0.62, el: 0.4, dist: 19.5, look: [2.0, 0.8, 1.0] },
};

function create3D(artEl, kind) {
  const stage = artEl.parentNode;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.opacity = "0";
  canvas.style.transition = "opacity 700ms cubic-bezier(.2,.7,.2,1)";
  canvas.style.position = "absolute"; canvas.style.inset = "0";
  artEl.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COL.sky);
  scene.fog = new THREE.Fog(COL.sky, 34, 70);
  const camera = new THREE.PerspectiveCamera(30, 1.4, 0.5, 120);

  scene.add(new THREE.HemisphereLight(0xF4F8FF, 0xC9DDB4, 1.9));
  const sun = new THREE.DirectionalLight(0xFFF6EA, 2.1);
  sun.position.set(7, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 40;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  scene.add(sun);

  const W = buildWorld(scene);
  // Compile every material up front (including hidden ones) so the first spark or sneeze doesn't stutter.
  {
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    W.house.im.count = W.house.slots.length;
    try { renderer.compile(scene, new THREE.PerspectiveCamera()); } catch (e) {}
    W.house.im.count = 0;
    hidden.forEach((o) => { o.visible = false; });
  }
  let target = null;
  let step = kind === "hero" ? "hero" : 1;
  const cam = Object.assign({}, CAMS[step], { look: CAMS[step].look.slice() });
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let aspect = 1.4, visible = false, running = false, time = 0, last = 0, faded = false, oldRenderer = null;
  let sneezeT = -1, lastSneeze = false, lastPlane = null;
  const fpsWin = []; let fps = 0;

  function resize() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    canvas.style.width = "100%"; canvas.style.height = "100%";
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (!running) renderOnce();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  function onPointer(e) {
    const r = stage.getBoundingClientRect();
    tilt.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    tilt.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }
  function onLeave() { tilt.tx = 0; tilt.ty = 0; }
  stage.addEventListener("pointermove", onPointer, { passive: true });
  stage.addEventListener("pointerleave", onLeave, { passive: true });

  /* ---- apply a target state ---- */
  function set(state, instant) {
    target = state;
    const risen = state.fence === "built" ? (state.risen == null ? SEGS : state.risen) : 0;
    W.segs.forEach((s, k) => {
      s.target = k < risen ? 1 : 0;
      const m = (state.seg && state.seg[k]) || "wood";
      if (m === "red" && s.mode !== "red") s.wobble = 1;
      s.mode = m;
    });
    const total = W.house.slots.length;
    W.house.target = Math.round((Math.min(30, state.bricks || 0) / 30) * total);
    W.house.roofTarget = state.roof ? 1 : 0;
    W.house.flagTarget = state.flag ? 1 : 0;
    if (state.sneeze && !lastSneeze) sneezeT = 0;
    lastSneeze = !!state.sneeze;
    if (state.plane && state.plane !== lastPlane) {
      const P = W.plane;
      if (state.plane === "fly" || P.t < 0) { P.t = state.plane === "spark" ? 0.72 : 0; P.m.visible = true; P.fall = 0; }
    }
    lastPlane = state.plane || null;
    if (instant) snap();
  }

  function snap() {
    W.segs.forEach((s) => { s.p = s.target; });
    W.house.cur = W.house.target;
    W.house.roofP = W.house.roofTarget;
    W.house.flagP = W.house.flagTarget;
    W.ghost.o = target && target.fence === "plan" ? 1 : 0;
    W.segs.forEach((s) => { const c = segColors(s.mode); s.postMat.color.set(c.post); s.capMat.color.set(c.cap); s.railMat.color.set(c.rail); });
    W.tina.angle = target && target.tina === "inspect" ? 0.62 : 1.3;
    W.tina.g.position.copy(onRing(7.45, W.tina.angle));
    const c = CAMS[step];
    cam.az = c.az; cam.el = c.el; cam.dist = c.dist; cam.look = c.look.slice();
    update(0);
  }

  function segColors(mode) {
    if (mode === "red") return { post: COL.red, cap: COL.redCap, rail: COL.red };
    if (mode === "green") return { post: COL.wood, cap: COL.green, rail: COL.green };
    return { post: COL.wood, cap: COL.woodCap, rail: COL.rail };
  }

  const tmpC = new THREE.Color(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  function walk(ch, speed, t, moving) {
    const sw = moving ? Math.sin(t * speed) * 0.55 : 0;
    ch.legs[0].rotation.x = damp(ch.legs[0].rotation.x, sw, 14, 1 / 60);
    ch.legs[1].rotation.x = damp(ch.legs[1].rotation.x, -sw, 14, 1 / 60);
    if (ch.legs[2]) { ch.legs[2].rotation.x = damp(ch.legs[2].rotation.x, -sw, 14, 1 / 60); ch.legs[3].rotation.x = damp(ch.legs[3].rotation.x, sw, 14, 1 / 60); }
  }
  function faceTo(obj, dx, dz, dt, k = 8) {
    const want = Math.atan2(dx, dz);
    obj.rotation.y = angleLerp(obj.rotation.y, want, 1 - Math.exp(-k * dt));
  }

  /* ---- per-frame animation ---- */
  function update(dt) {
    time += dt;
    const t = time;
    if (!target) return;

    // Fence rise and colour
    W.segs.forEach((s, k) => {
      if (s.target > s.p) s.p = Math.min(s.target, s.p + dt / 0.6); else if (s.target < s.p) s.p = Math.max(s.target, s.p - dt / 0.35);
      s.posts.forEach((post, j) => {
        const pj = clamp01((s.p * 1.7 - j * 0.12) / 0.55);
        post.scale.y = Math.max(0.001, pj > 0 ? easeBack(pj) : 0);
      });
      s.rails.forEach((rail, j) => { rail.scale.x = Math.max(0.001, easeOut(clamp01((s.p * 1.7 - j * 0.12 - 0.3) / 0.5))); });
      const c = segColors(s.mode);
      const kc = 1 - Math.exp(-6 * dt);
      s.postMat.color.lerp(tmpC.set(c.post), kc);
      s.capMat.color.lerp(tmpC.set(c.cap), kc);
      s.railMat.color.lerp(tmpC.set(c.rail), kc);
      s.wobble = Math.max(0, s.wobble - dt * 1.4);
      s.group.position.y = s.wobble > 0 ? Math.sin(t * 40) * 0.03 * s.wobble : 0;
    });
    const allUp = W.segs.every((s) => s.p > 0.98);
    W.gate.scale.y = damp(W.gate.scale.y, allUp ? 1 : 0.001, 8, dt);

    // Ghost plan
    const gTarget = target.fence === "plan" ? 1 : 0;
    W.ghost.o = damp(W.ghost.o, gTarget, 5, dt);
    W.ghost.mats[0].opacity = W.ghost.o * 0.42;
    W.ghost.mats[1].opacity = W.ghost.o * 0.85;
    W.ghost.group.visible = W.ghost.o > 0.01;
    W.ghost.group.children.forEach((p, i) => { if (p.isMesh) p.scale.y = 0.6 + 0.4 * Math.max(0, Math.sin(t * 2.2 - i * 0.35)) * W.ghost.o; });

    // Bricks
    const H = W.house, total = H.slots.length;
    const diff = H.target - H.cur;
    if (Math.abs(diff) > 0.01) {
      const rate = diff > 0 ? Math.max(38, diff * 2.2) : Math.max(160, -diff * 3);
      H.cur = diff > 0 ? Math.min(H.target, H.cur + rate * dt) : Math.max(H.target, H.cur - rate * dt);
    }
    const shown = Math.min(total, Math.ceil(H.cur + 0.001));
    H.im.count = shown;
    for (let i = Math.max(0, shown - 10); i < shown; i++) {
      const s = H.slots[i];
      const pr = clamp01((H.cur - i) / 5);
      const e = easeOut(pr);
      tmpP.set(s.x, s.y + (1 - e) * 0.9, s.z);
      tmpQ.setFromAxisAngle(up, s.ry + (1 - e) * 0.6);
      tmpS.setScalar(Math.max(0.001, Math.min(1, pr * 1.6)));
      tmpM.compose(tmpP, tmpQ, tmpS);
      H.im.setMatrixAt(i, tmpM);
    }
    for (let i = 0; i < Math.max(0, shown - 10); i++) {
      if (H.im.userData.settled > i) continue;
      const s = H.slots[i];
      tmpP.set(s.x, s.y, s.z); tmpQ.setFromAxisAngle(up, s.ry); tmpS.setScalar(1);
      H.im.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
    }
    H.im.userData.settled = Math.max(0, shown - 10);
    if (diff < 0) H.im.userData.settled = 0;
    H.im.instanceMatrix.needsUpdate = true;
    const rowsDone = H.cur / (total / 8);
    H.door.scale.y = damp(H.door.scale.y, rowsDone > 5 ? 1 : 0.001, 8, dt);
    H.wins.forEach((w) => w.scale.setScalar(damp(w.scale.x, rowsDone > 6 ? 1 : 0.001, 8, dt)));
    H.inner.scale.y = Math.max(0.001, clamp01((rowsDone - 0.6) / 8));
    if (H.roofTarget > H.roofP) H.roofP = Math.min(1, H.roofP + dt / 0.9); else if (H.roofTarget < H.roofP) H.roofP = Math.max(0, H.roofP - dt / 0.4);
    H.roof.visible = H.roofP > 0.001;
    H.roof.position.y = HOUSE.rows * HOUSE.bh + (1 - easeOut(H.roofP)) * 2.6;
    H.roof.scale.setScalar(0.4 + 0.6 * easeOut(H.roofP));
    H.flagP = damp(H.flagP, H.flagTarget, 5, dt);
    H.flag.scale.y = Math.max(0.001, H.flagP);
    H.flag.visible = H.flagP > 0.01;
    const cp = H.cloth.geometry.attributes.position;
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i); cp.setZ(i, Math.sin(x * 7 - t * 5) * 0.05 * x); }
    cp.needsUpdate = true;
    H.pile.visible = H.cur < total - 0.5 || target.agentBrick;

    // Tini: hammers while the fence goes up, near the gate
    {
      const T = W.tini;
      const rising = W.segs.some((s) => s.target > s.p + 0.01) || (W.gate.scale.y < 0.98 && allUp);
      const want = target.fence === "plan" ? -0.55 : -0.28;
      const prev = T.angle;
      T.angle = angleLerp(T.angle, want, 1 - Math.exp(-2.5 * dt));
      const moving = Math.abs(T.angle - prev) > 0.0015;
      T.g.position.copy(onRing(7.35, T.angle));
      walk(T, 11, t, moving);
      if (moving) faceTo(T.g, T.g.position.x - onRing(7.35, prev).x, T.g.position.z - onRing(7.35, prev).z, dt);
      else faceTo(T.g, -T.g.position.x * 0.3 + 1.5, 1.2, dt, 4);
      const swing = rising ? Math.max(0, Math.sin(t * 11)) : 0;
      T.armR.rotation.x = damp(T.armR.rotation.x, rising ? -1.3 - swing * 1.1 : -0.25, 16, dt);
      T.armL.rotation.x = damp(T.armL.rotation.x, moving ? Math.sin(t * 11) * 0.4 : 0, 10, dt);
      T.g.position.y = moving ? Math.abs(Math.sin(t * 11)) * 0.04 : 0;
      T.head.rotation.z = Math.sin(t * 1.3) * 0.04;
    }

    // Tina: walks along the fence to inspect; sneezes at red
    {
      const T = W.tina;
      const want = target.tina === "inspect" ? 0.62 : 1.3;
      const prev = T.angle;
      const step = Math.sign(want - T.angle) * Math.min(Math.abs(want - T.angle), dt * 0.55);
      T.angle += step;
      const moving = Math.abs(step) > 0.0004;
      T.g.position.copy(onRing(7.45, T.angle));
      walk(T, 10, t, moving);
      if (moving) { const a = onRing(7.45, prev); faceTo(T.g, T.g.position.x - a.x, T.g.position.z - a.z, dt); }
      else if (target.tina === "inspect") faceTo(T.g, -T.g.position.x, -T.g.position.z, dt, 5);
      else faceTo(T.g, -T.g.position.x * 0.4, 6 - T.g.position.z * 0.2, dt, 4);
      T.g.position.y = moving ? Math.abs(Math.sin(t * 10)) * 0.035 : 0;
      const inspecting = target.tina === "inspect" && !moving;
      T.armR.rotation.x = damp(T.armR.rotation.x, inspecting ? -1.45 + Math.sin(t * 2.4) * 0.12 : -0.2, 7, dt);
      T.armR.rotation.z = damp(T.armR.rotation.z, inspecting ? 0.25 : 0, 7, dt);
      T.head.rotation.x = damp(T.head.rotation.x, inspecting ? 0.12 : 0, 6, dt);
      // sneeze: wind-up, then a snap forward
      if (sneezeT >= 0) {
        sneezeT += dt;
        const s = sneezeT;
        const lean = s < 0.45 ? -0.28 * easeOut(s / 0.45) : s < 0.6 ? -0.28 + 0.75 * ((s - 0.45) / 0.15) : Math.max(0, 0.47 * (1 - (s - 0.6) / 0.5));
        T.head.rotation.x = lean;
        T.g.scale.set(CH * (1 + (s > 0.45 && s < 0.8 ? 0.05 : 0)), CH * (1 - (s > 0.45 && s < 0.8 ? 0.05 : 0)), CH);
        const bp = s < 0.45 ? 0 : clamp01((s - 0.45) / 0.18);
        W.bubble.visible = s > 0.45 && s < 1.9;
        W.bubble.material.opacity = s > 1.6 ? clamp01((1.9 - s) / 0.3) : 1;
        W.bubble.scale.set(1.5 * easeBack(bp), 0.56 * easeBack(bp), 1);
        W.bubble.position.set(T.g.position.x, 3.05 + (s - 0.45) * 0.12, T.g.position.z);
        if (s > 2) { sneezeT = -1; W.bubble.visible = false; T.g.scale.setScalar(CH); }
      }
    }

    // The Agent: carries bricks from the pile to the wall while building, sways otherwise
    {
      const D = W.agent;
      const building = H.cur < H.target - 0.5 || (target.agentBrick && H.cur < total - 0.5);
      let dest;
      if (building) {
        if (D.leg === "toWall") {
          const s = H.slots[Math.min(total - 1, Math.floor(H.cur))];
          if (!D.wallPt || D.wallSlot !== D.slot) {
            // deliver to the visible faces only (front or right), so the Agent never walks through the house
            const onRight = s.face === "right" || s.face === "back";
            D.wallPt = onRight ? new THREE.Vector3(HOUSE.x + HOUSE.w / 2 + 0.55, 0, HOUSE.z + (Math.random() - 0.5) * 1.6)
                               : new THREE.Vector3(HOUSE.x + (Math.random() - 0.2) * 2.6, 0, HOUSE.z + HOUSE.d / 2 + 0.6);
            D.wallSlot = D.slot;
          }
          dest = D.wallPt;
        } else dest = tmpP.set(H.pile.position.x - 0.5, 0, H.pile.position.z + 0.1).clone();
      } else dest = new THREE.Vector3(2.35, 0, 1.75);
      const dx = dest.x - D.g.position.x, dz = dest.z - D.g.position.z, dist = Math.hypot(dx, dz);
      const moving = dist > 0.06;
      if (moving) {
        const sp = Math.min(dist, dt * 3.0);
        D.g.position.x += (dx / dist) * sp; D.g.position.z += (dz / dist) * sp;
        faceTo(D.g, dx, dz, dt, 10);
      } else if (building) {
        D.leg = D.leg === "toWall" ? "toPile" : "toWall"; D.slot++;
      } else {
        faceTo(D.g, 0.8, 1, dt, 3);
      }
      walk(D, 12, t, moving);
      const carrying = building && D.leg === "toWall";
      D.body.position.y = moving ? Math.abs(Math.sin(t * 12)) * 0.05 : Math.sin(t * 2) * 0.012;
      D.body.rotation.z = moving ? Math.sin(t * 12) * 0.05 : Math.sin(t * 1.3) * 0.03;
      D.brick.visible = carrying;
      D.arms.forEach((a, i) => {
        const swing = moving ? Math.sin(t * 12 + (i ? 0 : Math.PI)) * 0.5 : Math.sin(t * 1.6 + i) * 0.06;
        a.rotation.x = damp(a.rotation.x, carrying ? -1.15 : swing, 12, dt);
        a.rotation.z = damp(a.rotation.z, carrying ? (i ? 0.25 : -0.25) : 0, 10, dt);
      });
      D.head.rotation.x = damp(D.head.rotation.x, moving ? 0.04 : Math.sin(t * 1.7) * 0.04, 5, dt);
      D.head.rotation.z = !moving && !building ? Math.sin(t * 0.9) * 0.08 : 0;
    }

    // Paper plane and sparks
    {
      const P = W.plane;
      if (P.t >= 0) {
        P.t += dt;
        const u = clamp01(P.t / P.dur);
        const mid = new THREE.Vector3((P.from.x + P.hit.x) / 2, P.from.y + 0.6, (P.from.z + P.hit.z) / 2);
        if (u < 1) {
          const a = 1 - u;
          const pos = new THREE.Vector3().copy(P.from).multiplyScalar(a * a).addScaledVector(mid, 2 * a * u).addScaledVector(P.hit, u * u);
          const nxt = new THREE.Vector3().copy(P.from).multiplyScalar((1 - u - 0.02) ** 2).addScaledVector(mid, 2 * (1 - u - 0.02) * (u + 0.02)).addScaledVector(P.hit, (u + 0.02) ** 2);
          P.m.position.copy(pos); P.m.lookAt(nxt); P.m.rotateZ(Math.sin(P.t * 7) * 0.25);
          P.m.material.opacity = 1;
        } else {
          if (!P.burst) {
            P.burst = true;
            W.segs[3].wobble = 0.8;
            P.sparks.forEach((s) => {
              s.m.visible = true; s.life = 0.7 + Math.random() * 0.3;
              s.m.position.copy(P.hit);
              s.v.set((Math.random() - 0.2) * 3.5, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 3.5);
            });
          }
          P.fall += dt;
          P.m.position.x += dt * 1.6; P.m.position.y = Math.max(0.05, P.hit.y - P.fall * P.fall * 2.8 + P.fall * 0.8);
          P.m.rotation.x += dt * 5;
          P.m.material.opacity = clamp01(1 - (P.fall - 0.9) / 0.6);
          if (P.fall > 1.6) { P.t = -1; P.m.visible = false; P.burst = false; }
        }
      }
      P.sparks.forEach((s) => {
        if (s.life <= 0) { s.m.visible = false; return; }
        s.life -= dt;
        s.v.y -= 9 * dt;
        s.m.position.addScaledVector(s.v, dt);
        s.m.scale.setScalar(Math.max(0.01, s.life * 1.3));
        s.m.rotation.x += dt * 8; s.m.rotation.y += dt * 6;
      });
    }

    // Clouds drift
    W.clouds.forEach((c, i) => { c.position.x += dt * (0.25 + i * 0.07); if (c.position.x > 24) c.position.x = -24; });

    // Camera: gentle drift plus pointer tilt
    const want = CAMS[step];
    const k = 1.8;
    cam.az = damp(cam.az, want.az, k, dt); cam.el = damp(cam.el, want.el, k, dt); cam.dist = damp(cam.dist, want.dist, k, dt);
    for (let i = 0; i < 3; i++) cam.look[i] = damp(cam.look[i], want.look[i], k, dt);
    tilt.x = damp(tilt.x, tilt.tx, 3, dt); tilt.y = damp(tilt.y, tilt.ty, 3, dt);
    const drift = step === "hero" ? Math.sin(t * 0.11) * 0.22 : Math.sin(t * 0.15) * 0.06;
    const az = cam.az + drift + tilt.x * 0.14;
    const el = Math.max(0.25, cam.el - tilt.y * 0.07 + Math.sin(t * 0.17) * 0.015);
    const fit = aspect < 1.4 ? 1.4 / aspect : 1;
    const d = cam.dist * Math.min(fit, 1.7);
    camera.position.set(cam.look[0] + d * Math.cos(el) * Math.sin(az), cam.look[1] + d * Math.sin(el), cam.look[2] + d * Math.cos(el) * Math.cos(az));
    camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
  }

  function renderOnce() { renderer.render(scene, camera); }

  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    fpsWin.push(now); while (fpsWin.length && now - fpsWin[0] > 1000) fpsWin.shift(); fps = fpsWin.length;
    update(dt);
    renderOnce();
    if (!faded) {
      faded = true;
      requestAnimationFrame(() => { canvas.style.opacity = "1"; });
      setTimeout(() => { if (oldRenderer) { oldRenderer.destroy(); oldRenderer = null; } }, 750);
    }
  }

  function setVisible(v) {
    visible = v;
    if (v && !running) { running = true; last = 0; renderer.setAnimationLoop(frame); }
    else if (!v && running) { running = false; renderer.setAnimationLoop(null); }
  }

  resize();

  return {
    kind: "3d",
    set,
    setVisible,
    step(n) { step = n; },
    takeover(old) { oldRenderer = old; if (!visible) { renderOnce(); } },
    fps: () => (running ? fps : 0),
    destroy() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      stage.removeEventListener("pointermove", onPointer);
      stage.removeEventListener("pointerleave", onLeave);
      renderer.dispose();
      canvas.remove();
    },
  };
}

/* ---------------- boot ---------------- */
const made = {};
function boot() {
  if (!site || reduce.matches || !hasWebGL()) return;
  for (const name of ["hero", "story"]) {
    const p = site.players[name];
    if (!p || made[name]) continue;
    const r = create3D(p.art, name);
    if (!r) return;
    made[name] = r;
    if (name === "story") r.step(site.currentStep() || 1);
    p.useRenderer(r);
  }
  document.documentElement.classList.add("has-3d");
}
function unboot() {
  for (const name of Object.keys(made)) {
    const p = site.players[name];
    p.useRenderer(site.svgRenderer(p.art));
    delete made[name];
  }
  document.documentElement.classList.remove("has-3d");
}
window.__tiniFps = () => Object.fromEntries(Object.entries(made).map(([k, r]) => [k, r.fps()]));

if (reduce.addEventListener) reduce.addEventListener("change", () => { if (reduce.matches) unboot(); else boot(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(boot); else boot();
