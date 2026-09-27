import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import type { Mesh } from 'three';
import { diorama as D, yardLayout as L } from '../layout.ts';
import { brickCells, rectBox } from './world.ts';

const C = D.colors;

/** One brick; a newly placed one drops in and settles with a small bounce (decoration only). */
function Brick({ x, y, z, drop, layer }: { x: number; y: number; z: number; drop: boolean; layer: number }) {
  const mesh = useRef<Mesh>(null);
  const start = useRef<number | null>(drop ? null : -1);
  useFrame(({ clock }) => {
    if (!mesh.current || start.current === -1) return;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - start.current) / 0.5);
    // Fall with gravity, then a single damped bounce.
    const bounce = t < 0.7 ? (1 - (t / 0.7) ** 2) * 2.4 : Math.sin(((t - 0.7) / 0.3) * Math.PI) * 0.12;
    mesh.current.position.y = y + bounce;
    if (t >= 1) { mesh.current.position.y = y; start.current = -1; }
  });
  const [w, h, d] = D.house.brick;
  return <RoundedBox ref={mesh} args={[w, h, d]} radius={0.06} smoothness={2} position={[x, drop ? y + 2.4 : y, z]} castShadow receiveShadow>
    <meshStandardMaterial color={layer % 2 ? C.brickDark : C.brick} roughness={0.8} />
  </RoundedBox>;
}

/** The project's house: a stone slab that fills with bricks, layer on layer, one per dog.brick.placed. */
export function House({ bricks, epoch }: { bricks: number; epoch: number }) {
  const house = rectBox(L.house);
  const cells = brickCells(bricks);
  // Only bricks added after the current epoch was drawn animate; a snapshot or reset draws instantly.
  const seen = useRef({ epoch, count: cells.length });
  useEffect(() => { seen.current = { epoch, count: cells.length }; });
  const animateFrom = seen.current.epoch === epoch ? seen.current.count : cells.length;
  const top = cells.length ? cells.at(-1)!.y + D.house.brick[1] : D.house.slab;
  return <group>
    <RoundedBox args={[house.width + 0.3, D.house.slab, house.depth + 0.3]} radius={0.06} position={[house.x, D.house.slab / 2, house.z]} receiveShadow castShadow>
      <meshStandardMaterial color={C.slab} roughness={0.95} />
    </RoundedBox>
    {cells.map((cell, i) => <Brick key={`${epoch}-${i}`} {...cell} drop={i >= animateFrom} />)}
    <Html position={[house.x, 0.55, house.z + house.depth / 2 + 0.75]} transform sprite distanceFactor={D.sign.scale} zIndexRange={[8, 0]} className="d3-tag house">
      House · the project<span>{bricks} {bricks === 1 ? 'brick' : 'bricks'}</span>
    </Html>
  </group>;
}
