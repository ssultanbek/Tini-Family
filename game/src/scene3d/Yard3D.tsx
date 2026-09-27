import { useSyncExternalStore } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Html } from '@react-three/drei';
import { Bloom, EffectComposer, TiltShift2 } from '@react-three/postprocessing';
import { useEffect } from 'react';
import { diorama as D, familyLayout as F } from '../layout.ts';
import { store } from '../store.ts';
import { Decor, Hedges, Island, YardGround } from './Island.tsx';
import { Fences } from './Fence3D.tsx';
import { House } from './House3D.tsx';
import { MacMansion } from './Mac3D.tsx';
import { toWorld } from './world.ts';
import './game3d.css';

const params = new URLSearchParams(window.location.search);
/** ?fx=off drops post-processing and uses a smaller shadow map, for slow machines or screen recording. */
const fx = params.get('fx') !== 'off';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function CameraRig() {
  const camera = useThree(state => state.camera);
  useEffect(() => { camera.lookAt(...D.camera.target); }, [camera]);
  return null;
}

/** Phase 1 stand-ins so the scale reads; the real characters and their animations come in phase 2. */
function FamilyStandIns({ dog }: { dog: string }) {
  const people = [
    { key: 'tini', name: 'Tini', color: '#4f86c6', at: F.homes.tini, height: 1.1 },
    { key: 'tina', name: 'Tina', color: '#a4679a', at: F.homes.tina, height: 1.05 },
    { key: 'dog', name: dog === 'sleeping' ? 'Dog · zzz' : 'Dog', color: '#d39a5b', at: F.homes.dog, height: 0.6 },
  ];
  return <group>{people.map(p => {
    const w = toWorld(p.at.x, p.at.y);
    return <group key={p.key} position={[w.x, 0, w.z]}>
      <mesh position={[0, p.height / 2 + 0.1, 0]} castShadow><capsuleGeometry args={[0.28, p.height - 0.5, 4, 10]} /><meshStandardMaterial color={p.color} roughness={0.7} /></mesh>
      <mesh position={[0, p.height + 0.25, 0]} castShadow><sphereGeometry args={[0.26, 12, 10]} /><meshStandardMaterial color={p.key === 'dog' ? '#e5b27a' : '#f2cfae'} roughness={0.8} /></mesh>
      <Html position={[0, p.height + 0.85, 0]} transform sprite distanceFactor={D.sign.scale} zIndexRange={[12, 0]} className="d3-name">{p.name}</Html>
    </group>;
  })}</group>;
}

function Scene() {
  const { world, epoch } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const s = D.sun;
  return <>
    <CameraRig />
    <hemisphereLight args={['#e8f1ff', '#e9dcc3', 0.9]} />
    <directionalLight position={s.position} intensity={s.intensity} color="#fff0d8" castShadow
      shadow-mapSize={[fx ? s.shadowMap : s.shadowMapLow, fx ? s.shadowMap : s.shadowMapLow]} shadow-bias={-0.0004} shadow-normalBias={0.03}
      shadow-camera-left={-s.shadowBox} shadow-camera-right={s.shadowBox} shadow-camera-top={s.shadowBox} shadow-camera-bottom={-s.shadowBox} />
    <Island />
    <YardGround />
    <Decor />
    <Hedges segmentCount={world.segments.length} />
    <Fences segments={world.segments} reducedMotion={reducedMotion} />
    <House bricks={world.bricks} epoch={epoch} />
    <MacMansion requested={world.openEscalation?.requested ?? null} />
    <FamilyStandIns dog={world.dog} />
    {/* The block floats: a soft shadow on the "table" far below sells the miniature. */}
    <ContactShadows position={[0, -D.block.grass - D.block.soil - D.block.stone - 1.6, 0]} scale={52} blur={2.8} opacity={0.28} far={8} frames={1} />
    {fx && <EffectComposer multisampling={4}>
      <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.35} />
      <TiltShift2 blur={0.14} />
    </EffectComposer>}
  </>;
}

/** The 3D "Toy Diorama" yard for /?view=3d. Reads the same store as the 2D yard; draws state, never decides it. */
export default function Yard3D() {
  const { world } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const c = D.camera;
  return <section className="yard-view yard3d" aria-label="The yard in 3D">
    <div className="yard-caption"><strong>The yard</strong><span>Only what the job needs</span><span className={`gv-phase ${['planning', 'fencing', 'building', 'inspecting'].includes(world.phase) ? 'busy' : world.phase === 'launched' ? 'done' : ''}`}>{world.phase}</span></div>
    <div className="yard3d-stage">
      <Canvas shadows="soft" flat dpr={[1, 2]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: c.position, fov: c.fov, near: 0.5, far: 200 }}>
        <Scene />
      </Canvas>
    </div>
    <p className="yard-help">○ Planned &nbsp; ▤ Built &nbsp; ◉ Inspecting &nbsp; ⚠ Needs fix &nbsp; ✓ Green{fx ? '' : ' · effects off'}</p>
  </section>;
}
