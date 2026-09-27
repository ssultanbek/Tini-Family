import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, type Group, type InstancedMesh } from 'three';
import { diorama as D, yardLayout as L } from '../layout.ts';
import { blockBox, rectBox } from './world.ts';

const C = D.colors;

/** Deterministic pseudo-random numbers, so the scatter is identical on every load. */
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** Points on the grass, avoiding the yard, the house footprint and the Mac mansion. */
function scatter(count: number, seed: number, insideYardToo = false) {
  const rnd = seeded(seed), b = blockBox(), yard = rectBox(L.ground), mac = { x: (L.mac.x + L.mac.width / 2 - D.center.x) * D.unit, hw: (L.mac.width / 2 + 40) * D.unit };
  const out: { x: number; z: number; r: number; s: number }[] = [];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const x = b.x + (rnd() - 0.5) * (b.width - 1.2), z = b.z + (rnd() - 0.5) * (b.depth - 1.2);
    const inYard = Math.abs(x - yard.x) < yard.width / 2 + 0.4 && Math.abs(z - yard.z) < yard.depth / 2 + 0.4;
    if (inYard && !insideYardToo) continue;
    if (Math.abs(x - mac.x) < mac.hw) continue;
    out.push({ x, z, r: rnd() * Math.PI * 2, s: 0.6 + rnd() * 0.7 });
  }
  return out;
}

function Instanced({ points, y, color, children }: { points: ReturnType<typeof scatter>; y: number; color: string; children: React.ReactNode }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new Object3D();
    points.forEach((p, i) => { dummy.position.set(p.x, y * p.s, p.z); dummy.rotation.set(0, p.r, 0); dummy.scale.setScalar(p.s); dummy.updateMatrix(); mesh.current?.setMatrixAt(i, dummy.matrix); });
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
  }, [points, y]);
  return <instancedMesh ref={mesh} args={[undefined, undefined, points.length]} castShadow receiveShadow>
    {children}<meshStandardMaterial color={color} flatShading roughness={1} />
  </instancedMesh>;
}

/** Grass tufts, little flowers and rocks: detail that makes the block read as a handmade model. */
export function Scatter() {
  const tufts = useMemo(() => scatter(260, 7, true), []);
  const flowersA = useMemo(() => scatter(40, 11), []);
  const flowersB = useMemo(() => scatter(40, 23), []);
  const rocks = useMemo(() => scatter(22, 31), []);
  return <group>
    <Instanced points={tufts} y={0.12} color={C.grassDark}><coneGeometry args={[0.09, 0.3, 4]} /></Instanced>
    <Instanced points={flowersA} y={0.1} color="#fff6e0"><icosahedronGeometry args={[0.08, 0]} /></Instanced>
    <Instanced points={flowersB} y={0.1} color="#f2a7b7"><icosahedronGeometry args={[0.08, 0]} /></Instanced>
    <Instanced points={rocks} y={0.08} color={C.stone}><dodecahedronGeometry args={[0.22, 0]} /></Instanced>
  </group>;
}

/** Soft low-poly clouds drifting slowly around the island. */
export function Clouds({ still }: { still: boolean }) {
  const group = useRef<Group>(null);
  const clouds = useMemo(() => {
    const rnd = seeded(5);
    // Only behind the island (seen from the demo camera) and high up, so a cloud never drifts in front of the lens.
    const behind = Math.atan2(-D.camera.position[2], -D.camera.position[0]);
    return Array.from({ length: 5 }, (_, i) => ({ angle: behind + (i - 2) * 0.42 + (rnd() - 0.5) * 0.2, radius: 30 + rnd() * 8, y: 12 + rnd() * 5, puffs: 3 + Math.floor(rnd() * 3), scale: 1.2 + rnd() * 0.9 }));
  }, []);
  useFrame(({ clock }) => { if (group.current && !still) group.current.rotation.y = Math.sin(clock.elapsedTime * 0.03) * 0.25; });
  return <group ref={group}>{clouds.map((c, i) => <group key={i} position={[Math.cos(c.angle) * c.radius, c.y, Math.sin(c.angle) * c.radius]} scale={c.scale}>
    {Array.from({ length: c.puffs }, (_, j) => <mesh key={j} position={[j * 0.9 - c.puffs * 0.45, Math.sin(j * 2.1) * 0.25, Math.cos(j * 1.7) * 0.3]}>
      <icosahedronGeometry args={[0.8 + (j % 2) * 0.3, 1]} /><meshStandardMaterial color="#ffffff" flatShading roughness={1} transparent opacity={0.92} />
    </mesh>)}
  </group>)}</group>;
}

/** A few birds circling high above, wings flapping. */
export function Birds({ still }: { still: boolean }) {
  const birds = useRef<(Group | null)[]>([]);
  const wings = useRef<(Group | null)[]>([]);
  useFrame(({ clock }) => {
    if (still) return;
    const t = clock.elapsedTime;
    birds.current.forEach((bird, i) => {
      if (!bird) return;
      const a = t * (0.18 + i * 0.03) + i * 2.1, r = 14 + i * 3;
      bird.position.set(Math.cos(a) * r, 9 + i * 0.8 + Math.sin(t + i) * 0.4, Math.sin(a) * r);
      bird.rotation.y = -a;
      const flap = Math.sin(t * 9 + i) * 0.6;
      const w = wings.current;
      if (w[i * 2]) w[i * 2]!.rotation.z = flap;
      if (w[i * 2 + 1]) w[i * 2 + 1]!.rotation.z = -flap;
    });
  });
  return <>{[0, 1, 2].map(i => <group key={i} ref={g => { birds.current[i] = g; }}>
    <mesh><sphereGeometry args={[0.12, 6, 5]} /><meshStandardMaterial color="#f7f7f2" flatShading /></mesh>
    {[-1, 1].map((side, j) => <group key={side} ref={g => { wings.current[i * 2 + j] = g; }}>
      <mesh position={[side * 0.28, 0, 0]} rotation={[0, 0, 0]} scale={[0.55, 0.04, 0.2]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#e9e9e2" flatShading /></mesh>
    </group>)}
  </group>)}</>;
}
