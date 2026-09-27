import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { Segment, SegmentStatus } from '../../../shared/events.ts';
import { diorama as D, yardLayout as L } from '../layout.ts';
import { fencePosts, fenceSpan, toWorld } from './world.ts';

const C = D.colors;
// Colour is never the only signal: every status also has an icon and a word on the sign.
export const statusLook: Record<SegmentStatus, { color: string; glow: number; icon: string; word: string }> = {
  planned: { color: C.planned, glow: 0, icon: '○', word: 'Planned' },
  built: { color: C.wood, glow: 0, icon: '▤', word: 'Built' },
  inspecting: { color: C.yellow, glow: 0.35, icon: '◉', word: 'Inspecting' },
  red: { color: C.red, glow: 0.55, icon: '⚠', word: 'Needs fix' },
  green: { color: C.green, glow: 0.35, icon: '✓', word: 'Green' },
};

/** One fence segment in its slot: posts, two rails, a status glow, and its sign. */
function FenceSegment({ segment, index, reducedMotion }: { segment: Segment; index: number; reducedMotion: boolean }) {
  const slot = L.slots[index];
  const group = useRef<Group>(null);
  const look = statusLook[segment.status];
  const planned = segment.status === 'planned';
  const span = fenceSpan(slot), posts = fencePosts(slot), f = D.fence;
  const tinted = segment.status !== 'built' && !planned;
  // Nudge the sign to the fence's outer side (away from the yard's middle) so signs on neighbouring slots separate.
  const mid = toWorld(L.ground.x + L.ground.width / 2, L.ground.y + L.ground.height / 2);
  const out = slot.vertical ? { x: Math.sign(span.x - mid.x) * D.sign.outward, z: 0 } : { x: 0, z: Math.sign(span.z - mid.z) * D.sign.outward };
  // Decoration only: inspecting pulses, red shivers. State never waits on this.
  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    const t = clock.elapsedTime;
    group.current.position.x = segment.status === 'red' ? Math.sin(t * 38) * 0.03 : 0;
    group.current.traverse(object => {
      const material = (object as { material?: { emissiveIntensity?: number } }).material;
      if (material && 'emissiveIntensity' in material && segment.status === 'inspecting') material.emissiveIntensity = 0.25 + 0.25 * Math.sin(t * 5);
    });
  });
  const material = (key: string) => <meshStandardMaterial key={key} color={tinted ? look.color : planned ? C.planned : C.wood}
    emissive={tinted ? look.color : '#000000'} emissiveIntensity={look.glow} transparent={planned} opacity={planned ? 0.45 : 1} roughness={0.85} />;
  return <group>
    <group ref={group}>
      {posts.map((p, i) => (planned && i % 2 === 1) ? null : <RoundedBox key={i} args={[f.post, f.height, f.post]} radius={0.05} smoothness={2} position={[p.x, f.height / 2, p.z]} castShadow>
        {material(`p${i}`)}
      </RoundedBox>)}
      {!planned && f.railHeights.map(h => <mesh key={h} position={[span.x, h, span.z]} rotation={[0, span.vertical ? Math.PI / 2 : 0, 0]} castShadow>
        <boxGeometry args={[span.length, f.rail, f.rail]} />{material(`r${h}`)}
      </mesh>)}
    </group>
    <Signpost segment={segment} x={span.x + out.x} z={span.z + out.z} look={look} />
  </group>;
}

/** A wooden signpost beside the fence: a real board on a post with a status lantern on top.
 *  The board faces the demo camera; its text is mounted flat on the board (bundled fonts, crisp). */
function Signpost({ segment, x, z, look }: { segment: Segment; x: number; z: number; look: (typeof statusLook)[SegmentStatus] }) {
  const lantern = useRef<Mesh>(null);
  const planned = segment.status === 'planned';
  const yaw = Math.atan2(D.camera.position[0] - x, D.camera.position[2] - z);
  const glow = segment.status === 'built' ? '#f6d9a8' : planned ? '#d8d2c4' : look.color;
  useFrame(({ clock }) => {
    if (!lantern.current) return;
    const material = lantern.current.material as MeshStandardMaterial;
    material.emissiveIntensity = segment.status === 'red' ? 1.4 + Math.sin(clock.elapsedTime * 6) * 0.6 : segment.status === 'inspecting' ? 1 + Math.sin(clock.elapsedTime * 4) * 0.5 : planned ? 0.1 : 0.9;
  });
  const s = D.sign;
  return <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
    <mesh position={[0, s.post / 2, -0.05]} castShadow><cylinderGeometry args={[0.07, 0.09, s.post, 6]} /><meshStandardMaterial color={C.woodDark} flatShading transparent={planned} opacity={planned ? 0.5 : 1} /></mesh>
    <RoundedBox args={[s.board[0], s.board[1], 0.1]} radius={0.05} smoothness={2} position={[0, s.boardY, 0]} castShadow>
      <meshStandardMaterial color={planned ? '#cfc6b3' : '#b98652'} roughness={0.9} transparent={planned} opacity={planned ? 0.7 : 1} />
    </RoundedBox>
    <RoundedBox args={[s.board[0] + 0.08, 0.1, 0.13]} radius={0.04} position={[0, s.boardY + s.board[1] / 2, 0]} castShadow>
      <meshStandardMaterial color={planned ? '#cfc8b8' : C.woodDark} roughness={0.9} />
    </RoundedBox>
    <mesh ref={lantern} position={[0, s.post + 0.2, -0.05]} castShadow>
      <icosahedronGeometry args={[0.22, 1]} /><meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={0.9} roughness={0.3} toneMapped={false} />
    </mesh>
    <Html position={[0, s.boardY, 0.06]} transform distanceFactor={s.text} zIndexRange={[10, 0]}>
      <div className={`d3-board st-${segment.status}`} title={segment.detail}>
        <strong>{segment.label}</strong>
        <span>{look.icon} {look.word}</span>
      </div>
    </Html>
  </group>;
}

export function Fences({ segments, reducedMotion }: { segments: Segment[]; reducedMotion: boolean }) {
  return <group>{segments.map((segment, index) => index < L.slots.length ? <FenceSegment key={segment.id} segment={segment} index={index} reducedMotion={reducedMotion} /> : null)}</group>;
}
