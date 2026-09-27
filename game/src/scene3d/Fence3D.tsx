import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import type { Group } from 'three';
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
    {/* One-line sign on its own fence: name + status (icon and word). Details live in the Analysis fence list. */}
    <Html position={[span.x + out.x, D.sign.height, span.z + out.z]} transform sprite distanceFactor={D.sign.scale} zIndexRange={[10, 0]}>
      <div className={`d3-sign ${segment.status}`} title={segment.detail}>
        <strong>{segment.label}</strong> <span className="d3-sign-status">{look.icon} {look.word}</span>
      </div>
    </Html>
  </group>;
}

export function Fences({ segments, reducedMotion }: { segments: Segment[]; reducedMotion: boolean }) {
  return <group>{segments.map((segment, index) => index < L.slots.length ? <FenceSegment key={segment.id} segment={segment} index={index} reducedMotion={reducedMotion} /> : null)}</group>;
}
