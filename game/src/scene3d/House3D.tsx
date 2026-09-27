import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { Shape, type Group, type Mesh, type MeshStandardMaterial } from 'three';
import { diorama as D, yardLayout as L } from '../layout.ts';
import { houseStage, rectBox } from './world.ts';

const C = D.colors;
const H = D.house;

/** A gable end: a triangle (base = depth, apex = rise), extruded along x by `thickness`. */
function Gable({ depth, rise, thickness, color }: { depth: number; rise: number; thickness: number; color: string }) {
  const shape = useMemo(() => {
    const s = new Shape();
    s.moveTo(-depth / 2, 0); s.lineTo(depth / 2, 0); s.lineTo(0, rise); s.closePath();
    return s;
  }, [depth, rise]);
  return <mesh rotation={[0, Math.PI / 2, 0]} castShadow receiveShadow>
    <extrudeGeometry args={[shape, { depth: thickness, bevelEnabled: false }]} />
    <meshStandardMaterial color={color} roughness={0.85} />
  </mesh>;
}

/** The brick that just landed: falls onto the wall top and settles with a bounce, then hides (decoration only). */
function LandingBrick({ x, y, z }: { x: number; y: number; z: number }) {
  const ref = useRef<Group>(null);
  const start = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = (clock.elapsedTime - start.current) / 0.6;
    ref.current.visible = t < 1.4;
    const fall = t < 0.7 ? (1 - (t / 0.7) ** 2) * 2.6 : Math.max(0, Math.sin(((t - 0.7) / 0.3) * Math.PI) * 0.15);
    ref.current.position.set(x, y + fall, z);
  });
  return <group ref={ref} position={[x, y + 2.6, z]}>
    <RoundedBox args={[0.55, 0.22, 0.3]} radius={0.04} castShadow><meshStandardMaterial color={C.brick} roughness={0.8} /></RoundedBox>
  </group>;
}

/** Soft puffs from the chimney once the house is complete. */
function Smoke() {
  const puffs = useRef<(Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    puffs.current.forEach((p, i) => {
      if (!p) return;
      const k = (clock.elapsedTime * 0.35 + i / 3) % 1;
      p.position.set(Math.sin(k * 4 + i) * 0.15, 0.9 + k * 1.6, 0);
      p.scale.setScalar(0.15 + k * 0.35);
      (p.material as MeshStandardMaterial).opacity = 0.7 * (1 - k);
    });
  });
  return <>{[0, 1, 2].map(i => <mesh key={i} ref={m => { puffs.current[i] = m; }}>
    <icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#f4f4f0" transparent opacity={0.6} flatShading depthWrite={false} />
  </mesh>)}</>;
}

/** The project's house, built from the brick count: walls rise course by course, then door, windows, roof and details. */
export function House({ bricks, epoch }: { bricks: number; epoch: number }) {
  const r = rectBox(L.house);
  const w = r.width, d = r.depth, t = H.wall, st = houseStage(bricks);
  const fullTop = H.slab + H.courses * H.course;
  const wallTop = H.slab + st.courses * H.course;
  // Bricks placed after this view was drawn get a landing animation; a snapshot or reset draws instantly.
  const seen = useRef({ epoch, bricks });
  const landed = seen.current.epoch === epoch && bricks > seen.current.bricks;
  useEffect(() => { seen.current = { epoch, bricks }; });
  const k = bricks % 4;
  const landing = [{ x: r.x - w * 0.2, z: r.z + d / 2 - t / 2 }, { x: r.x + w / 2 - t / 2, z: r.z + d * 0.15 }, { x: r.x + w * 0.2, z: r.z - d / 2 + t / 2 }, { x: r.x - w / 2 + t / 2, z: r.z - d * 0.15 }][k];

  // The front wall (facing +z, toward the demo camera) keeps a gap for the door; the others are solid.
  const dw = H.doorWidth, side = (w - dw) / 2, doorCourses = Math.ceil(H.doorHeight / H.course);
  const windowY = H.slab + H.course * 3.3;
  const roofW = w + H.overhang * 2, run = d / 2 + H.overhang, slope = Math.hypot(run, H.roofRise), angle = Math.atan2(H.roofRise, run);
  const glass = st.lit ? '#ffd98a' : '#9fc8e8';
  const brick = (i: number) => (i % 2 ? C.brickDark : C.brick);
  const wall = (key: string, pos: [number, number, number], size: [number, number, number], color: string) =>
    <mesh key={key} position={pos} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>;

  return <group>
    <RoundedBox args={[w + 0.5, H.slab, d + 0.5]} radius={0.06} position={[r.x, H.slab / 2, r.z]} receiveShadow castShadow>
      <meshStandardMaterial color={C.slab} roughness={0.95} />
    </RoundedBox>

    {/* Walls: one course per brick, alternating tones so the brickwork reads. */}
    {Array.from({ length: st.courses }, (_, i) => {
      const y = H.slab + H.course * (i + 0.5), c = brick(i);
      return <group key={i}>
        {wall('b', [r.x, y, r.z - d / 2 + t / 2], [w, H.course, t], c)}
        {wall('l', [r.x - w / 2 + t / 2, y, r.z], [t, H.course, d - t * 2], c)}
        {wall('r', [r.x + w / 2 - t / 2, y, r.z], [t, H.course, d - t * 2], c)}
        {i < doorCourses
          ? <>{wall('f1', [r.x - (dw / 2 + side / 2), y, r.z + d / 2 - t / 2], [side, H.course, t], c)}{wall('f2', [r.x + (dw / 2 + side / 2), y, r.z + d / 2 - t / 2], [side, H.course, t], c)}</>
          : wall('f', [r.x, y, r.z + d / 2 - t / 2], [w, H.course, t], c)}
      </group>;
    })}

    {st.door && <group position={[r.x, H.slab, r.z + d / 2 - t / 2 + 0.02]}>
      <RoundedBox args={[dw - 0.12, H.doorHeight - 0.1, 0.12]} radius={0.04} position={[0, (H.doorHeight - 0.1) / 2, 0]} castShadow><meshStandardMaterial color={C.woodDark} roughness={0.8} /></RoundedBox>
      <mesh position={[0.28, H.doorHeight * 0.5, 0.08]}><sphereGeometry args={[0.05, 8, 8]} /><meshStandardMaterial color="#e5c07b" metalness={0.6} roughness={0.3} /></mesh>
      <RoundedBox args={[dw + 0.3, 0.06, 0.5]} radius={0.02} position={[0, 0.03, 0.3]} receiveShadow><meshStandardMaterial color="#a8745a" roughness={1} /></RoundedBox>
    </group>}

    {st.windows && ([
      [[r.x - w / 2 + w * 0.2, windowY, r.z + d / 2 + 0.01], 0],
      [[r.x + w / 2 - w * 0.2, windowY, r.z + d / 2 + 0.01], 0],
      [[r.x + w / 2 + 0.01, windowY, r.z], Math.PI / 2],
      [[r.x - w / 2 - 0.01, windowY, r.z], -Math.PI / 2],
    ] as [[number, number, number], number][]).map(([p, ry], i) => <group key={i} position={p} rotation={[0, ry, 0]}>
      <RoundedBox args={[0.9, 0.8, 0.1]} radius={0.03}><meshStandardMaterial color="#f6efe2" roughness={0.8} /></RoundedBox>
      <mesh position={[0, 0, 0.04]}><boxGeometry args={[0.72, 0.62, 0.04]} /><meshStandardMaterial color={glass} emissive={glass} emissiveIntensity={st.lit ? 0.9 : 0.15} roughness={0.2} toneMapped={!st.lit} /></mesh>
      <mesh position={[0, 0, 0.07]}><boxGeometry args={[0.06, 0.62, 0.02]} /><meshStandardMaterial color="#f6efe2" /></mesh>
      <mesh position={[0, 0, 0.07]}><boxGeometry args={[0.72, 0.06, 0.02]} /><meshStandardMaterial color="#f6efe2" /></mesh>
      {st.flowers && i < 2 && <group position={[0, -0.5, 0.18]}>
        <RoundedBox args={[0.95, 0.18, 0.26]} radius={0.03}><meshStandardMaterial color={C.woodDark} /></RoundedBox>
        {[-0.3, -0.1, 0.1, 0.3].map((fx, j) => <mesh key={j} position={[fx, 0.16, 0]}><icosahedronGeometry args={[0.08, 0]} /><meshStandardMaterial color={j % 2 ? '#f2a7b7' : '#fff1a8'} flatShading /></mesh>)}
      </group>}
    </group>)}

    {/* Roof: gable ends and two slopes rise together as the roof bricks come in. */}
    {st.roof > 0 && <group position={[r.x, fullTop, r.z]} scale={[1, st.roof, 1]}>
      <group position={[-w / 2, 0, 0]}><Gable depth={d} rise={H.roofRise} thickness={w} color={C.brick} /></group>
      {[-1, 1].map(s => <mesh key={s} position={[0, H.roofRise / 2 + 0.06, s * run / 2]} rotation={[s * angle, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[roofW, 0.14, slope]} /><meshStandardMaterial color={C.roof} roughness={0.75} flatShading />
      </mesh>)}
      <mesh position={[0, H.roofRise + 0.12, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.1, 0.1, roofW, 8]} /><meshStandardMaterial color="#56647f" /></mesh>
    </group>}

    {st.chimney && <group position={[r.x + w * 0.25, fullTop + H.roofRise * 0.55, r.z - d * 0.18]}>
      <RoundedBox args={[0.45, 1.3, 0.45]} radius={0.04} castShadow><meshStandardMaterial color={C.brickDark} roughness={0.85} /></RoundedBox>
      <RoundedBox args={[0.55, 0.12, 0.55]} radius={0.03} position={[0, 0.7, 0]}><meshStandardMaterial color="#7d4a3a" /></RoundedBox>
      {st.lit && <Smoke />}
    </group>}

    {st.lamp && <group position={[r.x + dw / 2 + 0.35, H.slab, r.z + d / 2 + 0.35]}>
      <mesh position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.04, 0.05, 1.1, 6]} /><meshStandardMaterial color="#3d4450" /></mesh>
      <mesh position={[0, 1.15, 0]}><icosahedronGeometry args={[0.13, 1]} /><meshStandardMaterial color="#ffe3a0" emissive="#ffd06b" emissiveIntensity={st.lit ? 1.4 : 0.5} toneMapped={false} /></mesh>
    </group>}

    {landed && st.courses > 0 && <LandingBrick key={`${epoch}-${bricks}`} x={landing.x} y={Math.min(wallTop, fullTop) + 0.12} z={landing.z} />}

    <Html position={[r.x, fullTop + H.roofRise * st.roof + 0.55, r.z + d * 0.28]} transform sprite distanceFactor={D.sign.scale} zIndexRange={[8, 0]} className="d3-tag house">
      {st.lit ? 'The project · complete' : 'The project'}<span>{bricks} {bricks === 1 ? 'brick' : 'bricks'}</span>
    </Html>
  </group>;
}
