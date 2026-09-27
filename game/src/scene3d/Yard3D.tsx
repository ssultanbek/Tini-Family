import { useSyncExternalStore } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Bloom, EffectComposer, N8AO, TiltShift2 } from '@react-three/postprocessing';
import { useEffect, useRef } from 'react';
import type { Group } from 'three';
import { diorama as D } from '../layout.ts';
import { store } from '../store.ts';
import { Decor, Hedges, Island, YardGround } from './Island.tsx';
import { Fences } from './Fence3D.tsx';
import { House } from './House3D.tsx';
import { MacMansion } from './Mac3D.tsx';
import { Family3D } from './Family3D.tsx';
import { Birds, Clouds, Scatter } from './Life.tsx';
import './game3d.css';

const params = new URLSearchParams(window.location.search);
/** ?fx=off drops post-processing and uses a smaller shadow map, for slow machines or screen recording. */
const fx = params.get('fx') !== 'off';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The whole diorama floats: a slow, small bob (decoration only). */
function Floating({ children }: { children: React.ReactNode }) {
  const group = useRef<Group>(null);
  useFrame(({ clock }) => { if (group.current && !reducedMotion) group.current.position.y = Math.sin(clock.elapsedTime * 0.55) * 0.12; });
  return <group ref={group}>{children}</group>;
}

/** Drag to turn the island, scroll to zoom, double-click the stage to return to the demo view. */
function Controls() {
  const controls = useRef<import('three-stdlib').OrbitControls>(null);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.saveState();
    const reset = () => c.reset();
    window.addEventListener('tini:camera-reset', reset);
    return () => window.removeEventListener('tini:camera-reset', reset);
  }, []);
  const o = D.orbit;
  return <OrbitControls ref={controls} makeDefault target={D.camera.target} enableDamping dampingFactor={0.08} enablePan={false}
    minDistance={o.minDistance} maxDistance={o.maxDistance} minPolarAngle={o.minPolar} maxPolarAngle={o.maxPolar} rotateSpeed={0.6} zoomSpeed={0.7} />;
}

function Scene() {
  const { world, epoch } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const s = D.sun;
  return <>
    <Controls />
    <hemisphereLight args={['#e8f1ff', '#e9dcc3', 0.9]} />
    <directionalLight position={s.position} intensity={s.intensity} color="#fff0d8" castShadow
      shadow-mapSize={[fx ? s.shadowMap : s.shadowMapLow, fx ? s.shadowMap : s.shadowMapLow]} shadow-bias={-0.0004} shadow-normalBias={0.03}
      shadow-camera-left={-s.shadowBox} shadow-camera-right={s.shadowBox} shadow-camera-top={s.shadowBox} shadow-camera-bottom={-s.shadowBox} />
    <Floating>
      <Island />
      <YardGround />
      <Scatter />
      <Decor />
      <Hedges segmentCount={world.segments.length} />
      <Fences segments={world.segments} reducedMotion={reducedMotion} />
      <House bricks={world.bricks} epoch={epoch} />
      <MacMansion requested={world.openEscalation?.requested ?? null} />
      <Family3D />
    </Floating>
    <Clouds still={reducedMotion} />
    <Birds still={reducedMotion} />
    {/* The block floats: a soft shadow on the "table" far below sells the miniature. */}
    <ContactShadows position={[0, -D.block.grass - D.block.soil - D.block.stone - 1.6, 0]} scale={52} blur={2.8} opacity={0.28} far={8} frames={1} />
    {fx && <EffectComposer multisampling={4}>
      <N8AO halfRes aoRadius={1.2} intensity={1.6} distanceFalloff={0.6} />
      <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.45} />
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
    <div className="yard3d-stage" onDoubleClick={() => window.dispatchEvent(new Event('tini:camera-reset'))} title="Drag to turn the island · scroll to zoom · double-click to reset">
      <Canvas shadows="soft" flat dpr={[1, 2]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: c.position, fov: c.fov, near: 0.5, far: 200 }}>
        <Scene />
      </Canvas>
    </div>
    <p className="yard-help">○ Planned &nbsp; ▤ Built &nbsp; ◉ Inspecting &nbsp; ⚠ Needs fix &nbsp; ✓ Green{fx ? '' : ' · effects off'} &nbsp;·&nbsp; Drag to turn · scroll to zoom · double-click to reset</p>
  </section>;
}
