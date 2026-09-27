import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, Html } from '@react-three/drei';
import type { Group } from 'three';
import { diorama as D, yardLayout as L } from '../layout.ts';
import { blockBox, decorKind, hedgeSlots, rectBox, toWorld } from './world.ts';
import { spark } from './Family3D.tsx';

const C = D.colors;

/** The floating block: grass on top, then layered soil and stone, like a handmade model on a table. */
export function Island() {
  const b = blockBox(), k = D.block;
  const soilTop = -k.grass, stoneTop = soilTop - k.soil;
  return <group position={[b.x, 0, b.z]}>
    <RoundedBox args={[b.width, k.grass, b.depth]} radius={Math.min(k.radius, k.grass / 2)} smoothness={3} position={[0, -k.grass / 2, 0]} receiveShadow castShadow>
      <meshStandardMaterial color={C.grass} roughness={0.95} />
    </RoundedBox>
    <RoundedBox args={[b.width - k.lip * 0.4, k.soil, b.depth - k.lip * 0.4]} radius={k.radius * 0.6} smoothness={3} position={[0, soilTop - k.soil / 2, 0]} castShadow>
      <meshStandardMaterial color={C.soil} roughness={1} flatShading />
    </RoundedBox>
    {/* A darker seam halfway down the soil reads as sediment layers on the sides. */}
    <RoundedBox args={[b.width - k.lip * 0.25, 0.14, b.depth - k.lip * 0.25]} radius={0.07} position={[0, soilTop - k.soil * 0.55, 0]}>
      <meshStandardMaterial color={C.soilDark} roughness={1} />
    </RoundedBox>
    <RoundedBox args={[b.width - k.lip * 1.4, k.stone, b.depth - k.lip * 1.4]} radius={k.radius} smoothness={3} position={[0, stoneTop - k.stone / 2, 0]} castShadow>
      <meshStandardMaterial color={C.stone} roughness={1} flatShading />
    </RoundedBox>
    <RoundedBox args={[b.width - k.lip * 1.25, 0.12, b.depth - k.lip * 1.25]} radius={0.06} position={[0, stoneTop - k.stone * 0.45, 0]}>
      <meshStandardMaterial color={C.stoneDark} roughness={1} />
    </RoundedBox>
  </group>;
}

/** The fenced yard, the sand path out of the gate, and the gate itself. */
/** Gate build progress 0..1 (0 = not built yet), shared with the gate doors in Family3D. Decoration only. */
export const gateBuild = { progress: 0 };

/** Grows `from`→`to` over a window of the gate build (0..1), eased with a small overshoot, so pieces pop in. */
const pop = (p: number, from: number, to: number) => {
  const k = Math.min(1, Math.max(0, (p - from) / (to - from)));
  return k === 0 ? 0 : k === 1 ? 1 : 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
};

/** The yard floor and path; the gate and the fence beside it are built once fencing starts (~3.5s, never replayed). */
export function YardGround({ built, epoch }: { built: boolean; epoch: number }) {
  const yard = rectBox(L.ground);
  const pathTop = L.path.y, pathBottom = D.block.maxY - 30;
  const path = rectBox({ x: L.path.x, y: pathTop, width: L.path.width, height: pathBottom - pathTop });
  const gate = toWorld(L.gate.x, L.gate.y), gw = L.gate.width * D.unit;
  const lastP = useRef(1), posts = useRef<(Group | null)[]>([]), bar = useRef<Group>(null), runs = useRef<(Group | null)[]>([]), tag = useRef<Group>(null);
  // Snapshot/refresh (new epoch) with fencing already underway: built instantly. Built during this epoch: animate.
  const seen = useRef({ epoch, built });
  const animate = seen.current.epoch === epoch && built && !seen.current.built;
  useEffect(() => { seen.current = { epoch, built }; });
  const start = useRef<number | null>(null);
  if (!built) { start.current = null; gateBuild.progress = 0; lastP.current = 0; }
  else if (!animate && start.current === null) gateBuild.progress = 1;
  useFrame(({ clock }) => {
    if (built && animate && start.current === null) start.current = clock.elapsedTime;
    if (built && start.current !== null) gateBuild.progress = Math.min(1, (clock.elapsedTime - start.current) / D.gate.buildSeconds);
    const p = built ? gateBuild.progress : 0;
    posts.current.forEach((g, i) => g && g.scale.set(1, Math.max(0.001, pop(p, 0.02 + i * 0.08, 0.3 + i * 0.08)), 1));
    if (bar.current) { const k = pop(p, 0.35, 0.55); bar.current.visible = k > 0; bar.current.position.y = 1.5 + (1 - Math.min(1, k)) * 1.6; }
    runs.current.forEach((g, i) => g && g.scale.set(Math.max(0.001, pop(p, 0.45 + i * 0.12, 0.75 + i * 0.12)), Math.max(0.001, pop(p, 0.45 + i * 0.12, 0.7 + i * 0.12)), 1));
    if (tag.current) tag.current.visible = p >= 1;
    // A dust puff as each piece lands: posts, crossbar, each side fence, doors.
    for (const [mark, at] of [[0.3, gate], [0.55, gate], ...fillers.map((run, i) => [0.75 + i * 0.12, { x: (run.from.x + run.to.x) / 2, z: run.from.z }] as const), [0.98, gate]] as const) {
      if (lastP.current < mark && p >= mark) spark('dust', at, 0.2, 0.8);
    }
    lastP.current = p;
  });
  const fillers = gateFillers();
  return <group>
    <RoundedBox args={[yard.width, 0.06, yard.depth]} radius={0.03} position={[yard.x, 0.03, yard.z]} receiveShadow>
      <meshStandardMaterial color={C.yard} roughness={0.95} />
    </RoundedBox>
    <RoundedBox args={[path.width, 0.07, path.depth]} radius={0.03} position={[path.x, 0.04, path.z]} receiveShadow>
      <meshStandardMaterial color={C.sand} roughness={1} />
    </RoundedBox>
    {[-1, 1].map((side, i) => <group key={side} position={[gate.x + side * gw / 2, 0, gate.z]} ref={g => { posts.current[i] = g; }} scale={[1, 0.001, 1]}>
      <RoundedBox args={[0.3, 1.5, 0.3]} radius={0.06} position={[0, 0.75, 0]} castShadow><meshStandardMaterial color={C.woodDark} roughness={0.9} /></RoundedBox>
    </group>)}
    <group ref={bar} position={[gate.x, 1.5, gate.z]} visible={false}>
      <RoundedBox args={[gw + 0.5, 0.22, 0.26]} radius={0.06} castShadow><meshStandardMaterial color={C.wood} roughness={0.9} /></RoundedBox>
    </group>
    {/* Fence runs close the gaps between the gate and the yard corner / next fence slot; each grows out from the gate side. */}
    {fillers.map((run, i) => {
      const fromGate = Math.abs(run.from.x - gate.x) < Math.abs(run.to.x - gate.x);
      const anchor = fromGate ? run.from.x : run.to.x;
      return <group key={i} position={[anchor, 0, 0]} ref={g => { runs.current[i] = g; }} scale={[0.001, 0.001, 1]}>
        <group position={[-anchor, 0, 0]}><FenceRun {...run} /></group>
      </group>;
    })}
    <group ref={tag} visible={false}>
      <Html position={[gate.x, 1.95, gate.z]} transform sprite distanceFactor={D.sign.scale} zIndexRange={[5, 0]} className="d3-tag">Gate</Html>
    </group>
  </group>;
}

/** Pixel spans along the gate's side of the yard that no fence slot covers: corner → gate, gate → first slot. */
function gateFillers() {
  const gy = L.gate.y, gl = L.gate.x - L.gate.width / 2, gr = L.gate.x + L.gate.width / 2;
  const covered = L.slots.filter(sl => !sl.vertical && sl.y === gy).map(sl => [sl.x - L.fence.length / 2, sl.x + L.fence.length / 2]);
  const left = L.ground.x, right = L.ground.x + L.ground.width;
  const spans: [number, number][] = [[left, gl]];
  const next = covered.map(c => c[0]).filter(x => x >= gr).sort((a, b) => a - b)[0] ?? right;
  spans.push([gr, next]);
  const lastEnd = Math.max(gr, ...covered.map(c => c[1]));
  if (lastEnd < right) spans.push([lastEnd, right]);
  return spans.filter(([a, b]) => b - a > 4).map(([a, b]) => ({ from: toWorld(a, gy), to: toWorld(b, gy) }));
}

function FenceRun({ from, to }: { from: { x: number; z: number }; to: { x: number; z: number } }) {
  const length = to.x - from.x, n = Math.max(2, Math.round(length / 0.6) + 1), f = D.fence;
  return <group>
    {Array.from({ length: n }, (_, i) => <RoundedBox key={i} args={[f.post, f.height, f.post]} radius={0.05} smoothness={2} position={[from.x + (length * i) / (n - 1), f.height / 2, from.z]} castShadow>
      <meshStandardMaterial color={C.wood} roughness={0.85} />
    </RoundedBox>)}
    {f.railHeights.map(h => <mesh key={h} position={[from.x + length / 2, h, from.z]} castShadow>
      <boxGeometry args={[length, f.rail, f.rail]} /><meshStandardMaterial color={C.wood} roughness={0.85} />
    </mesh>)}
  </group>;
}

function Tree({ x, z, autumn = false, scale = 1 }: { x: number; z: number; autumn?: boolean; scale?: number }) {
  // A gentle breeze: each tree sways on its own phase.
  const crown = useRef<Group>(null);
  useFrame(({ clock }) => { if (crown.current) crown.current.rotation.z = Math.sin(clock.elapsedTime * 1.1 + x * 0.7 + z) * 0.035; });
  return <group ref={crown} position={[x, 0, z]} scale={scale}>
    <mesh position={[0, 0.35, 0]} castShadow><cylinderGeometry args={[0.12, 0.16, 0.7, 6]} /><meshStandardMaterial color={C.trunk} flatShading /></mesh>
    <mesh position={[0, 1.2, 0]} castShadow><coneGeometry args={[0.7, 1.4, 7]} /><meshStandardMaterial color={autumn ? C.autumn : C.leaf} flatShading /></mesh>
    <mesh position={[0, 1.85, 0]} castShadow><coneGeometry args={[0.5, 1.0, 7]} /><meshStandardMaterial color={autumn ? C.autumn : C.leafDark} flatShading /></mesh>
  </group>;
}

function Bush({ x, z, scale = 1, color = C.leaf }: { x: number; z: number; scale?: number; color?: string }) {
  return <mesh position={[x, 0.35 * scale, z]} scale={[scale, scale * 0.8, scale]} castShadow>
    <icosahedronGeometry args={[0.55, 0]} /><meshStandardMaterial color={color} flatShading />
  </mesh>;
}

/** Trees, bushes and small props, placed where the 2D yard has its Kenney decor. */
export function Decor() {
  return <group>{L.decor.map((prop, i) => {
    const p = toWorld(prop.x, prop.y), kind = decorKind(prop.frame);
    if (kind === 'tree' || kind === 'autumn') return <Tree key={i} {...p} autumn={kind === 'autumn'} scale={0.9 + (i % 3) * 0.12} />;
    if (kind === 'bush' || kind === 'sprout') return <Bush key={i} {...p} scale={kind === 'sprout' ? 0.55 : 0.9} />;
    if (kind === 'mushroom') return <group key={i} position={[p.x, 0, p.z]}>
      <mesh position={[0, 0.18, 0]}><cylinderGeometry args={[0.07, 0.09, 0.36, 6]} /><meshStandardMaterial color="#f3ead8" flatShading /></mesh>
      <mesh position={[0, 0.4, 0]} castShadow><sphereGeometry args={[0.24, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#d9534f" flatShading /></mesh>
    </group>;
    return <mesh key={i} position={[p.x, 0.35, p.z]} castShadow><sphereGeometry args={[0.35, 8, 6]} /><meshStandardMaterial color="#e8b84a" flatShading /></mesh>;
  })}</group>;
}

/** Unfenced left slots (facing the Mac) are sealed with a hedge, same rule as the 2D yard. */
export function Hedges({ segmentCount }: { segmentCount: number }) {
  return <group>{hedgeSlots(segmentCount).map(({ slot, index }) => {
    const c = toWorld(slot.x, slot.y), half = (L.fence.length * D.unit) / 2;
    return <group key={index}>{Array.from({ length: 9 }, (_, i) => {
      const d = -half + (2 * half * i) / 8;
      return <Bush key={i} x={c.x + (i % 2 ? 0.12 : -0.12)} z={c.z + d} scale={0.95 + (i % 3) * 0.08} color={C.hedge} />;
    })}</group>;
  })}</group>;
}
