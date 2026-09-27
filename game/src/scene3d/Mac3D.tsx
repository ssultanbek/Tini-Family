import { Html, RoundedBox } from '@react-three/drei';
import { diorama as D, yardLayout as L } from '../layout.ts';
import { macRoomFor, macRooms, type MacRoomId } from '../scene/macRooms.ts';
import { toWorld } from './world.ts';

const C = D.colors;
const icons: Record<MacRoomId, string> = { documents: '📄', photos: '🖼', ssh: '🔑', passwords: '🔐' };

/** "Your Mac": the mansion outside the fence. Four vault doors face the yard; the one Claude asks for glows amber. */
export function MacMansion({ requested }: { requested: string | null }) {
  const m = L.mac, M = D.mac;
  const top = m.titleY - m.titleHeight / 2, bottom = m.roomsY + macRooms.length * (m.roomHeight + m.roomGap);
  const a = toWorld(m.x, top), b = toWorld(m.x + m.width, bottom);
  const width = b.x - a.x, depth = b.z - a.z, cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
  const asked = requested ? macRoomFor(requested) : null;
  return <group>
    <RoundedBox args={[width + 0.4, 0.3, depth + 0.4]} radius={0.08} position={[cx, 0.15, cz]} receiveShadow>
      <meshStandardMaterial color={C.macDark} roughness={1} />
    </RoundedBox>
    <RoundedBox args={[width, M.height, depth]} radius={0.12} smoothness={3} position={[cx, 0.3 + M.height / 2, cz]} castShadow receiveShadow>
      <meshStandardMaterial color={C.mac} roughness={0.9} />
    </RoundedBox>
    {/* Low-poly gable roof: a three-sided prism along the building. */}
    <mesh position={[cx, 0.3 + M.height + M.roof / 2 - 0.05, cz]} rotation={[-Math.PI / 2, 0, 0]} scale={[width / 1.55, 1, M.roof * 0.62]} castShadow>
      <cylinderGeometry args={[1, 1, depth + 0.4, 3]} /><meshStandardMaterial color={C.roof} flatShading roughness={0.8} />
    </mesh>
    {macRooms.map((room, i) => {
      const z = toWorld(0, m.roomsY + i * (m.roomHeight + m.roomGap) + m.roomHeight / 2).z;
      const isAsked = room.id === asked;
      const glow = isAsked ? C.asked : C.door;
      return <group key={room.id} position={[b.x + 0.06, 0.3, z]}>
        <RoundedBox args={[0.16, M.doorHeight, M.doorWidth]} radius={0.06} position={[0, M.doorHeight / 2 + 0.1, 0]}>
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={isAsked ? 0.9 : 0.45} roughness={0.4} />
        </RoundedBox>
        <mesh position={[0.1, M.doorHeight / 2 + 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.32, 0.06, 6, 12]} /><meshStandardMaterial color="#5b6475" flatShading />
        </mesh>
        {/* Each door carries only its icon; the title board has the legend. A door in play gets a named callout. */}
        <Html position={[0.5, M.doorHeight + 0.55, 0]} transform sprite distanceFactor={D.sign.plaque} zIndexRange={[9, 0]}>
          <div className={`d3-door-icon ${isAsked ? 'asked' : ''}`} aria-label={`${room.label}: ${isAsked ? 'asked for' : 'locked'}`}>{icons[room.id]}</div>
        </Html>
        {isAsked && <Html position={[1.9, M.doorHeight + 0.2, 0]} transform sprite distanceFactor={D.sign.scale} zIndexRange={[11, 0]}>
          <div className="d3-vault asked"><span aria-hidden="true">{icons[room.id]}</span><strong>{room.label}</strong><em>Asked</em></div>
        </Html>}
      </group>;
    })}
    <Html position={[cx, 0.3 + M.height + M.roof + 0.8, cz]} transform sprite distanceFactor={D.sign.scale * 1.2} zIndexRange={[9, 0]}>
      <div className="d3-mac-title"><strong>Your Mac</strong><span>stays outside the fence</span>
        <ul>{macRooms.map(room => <li key={room.id}><span aria-hidden="true">{icons[room.id]}</span> {room.label}</li>)}</ul></div>
    </Html>
  </group>;
}
