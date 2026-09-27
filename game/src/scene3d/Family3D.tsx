import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import type { Group, Mesh } from 'three';
import type { EngineEvent, WorldState } from '../../../shared/events.ts';
import { diorama as D, familyLayout as F, yardLayout as L, segmentPosition } from '../layout.ts';
import { animationQueues, type AnimatedActor, type AnimationOptions } from '../queue.ts';
import { store } from '../store.ts';
import { route, toWorld, type XZ } from './world.ts';
import { gateBuild } from './Island.tsx';

// ---------------------------------------------------------------------------------------------
// Motion model. Every action starts only from its engine event (via the per-actor queues) and
// always settles: an aborted animation snaps to its end state, a cleared one just stops.
// ---------------------------------------------------------------------------------------------
type Action = { name: string; start: number; duration: number; data?: number };
type Effect = { id: number; kind: 'dust' | 'stars' | 'ring' | 'cards' | 'achoo' | 'check'; at: XZ; y: number; start: number; duration: number };
export type Body = {
  pos: XZ; yaw: number; path: XZ[]; speed: number; moving: boolean; walkPhase: number;
  action?: Action; carrying?: number; speech?: { text: string; until: number }; face?: number;
  arrive?: () => void;
};
const M = D.motion;
const now = () => performance.now() / 1000;
const w = (p: { x: number; y: number }) => toWorld(p.x, p.y);
const home = (actor: AnimatedActor, world: WorldState) => w(actor === 'dog' && world.dog !== 'sleeping' ? F.zones.house : F.homes[actor]);
const segmentIndex = (id?: string) => store.getSnapshot().world.segments.findIndex(segment => segment.id === id);
const atSegment = (id?: string, distance?: number) => w(segmentPosition(segmentIndex(id), distance));

let effectId = 0;
const effects = { list: [] as Effect[], listeners: new Set<() => void>() };
export function spark(kind: Effect['kind'], at: XZ, y: number, duration: number) {
  effects.list = [...effects.list.filter(e => now() - e.start < e.duration), { id: ++effectId, kind, at, y, start: now(), duration }];
  effects.listeners.forEach(listener => listener());
}

function useFamily() {
  const bodies = useRef<Record<AnimatedActor, Body>>(null!);
  if (!bodies.current) {
    const world = store.getSnapshot().world;
    const make = (actor: AnimatedActor): Body => ({ pos: home(actor, world), yaw: 0, path: [], speed: M.walk, moving: false, walkPhase: 0 });
    bodies.current = { tini: make('tini'), tina: make('tina'), dog: make('dog') };
  }
  return bodies.current;
}

/** One frame of walking: move along the path at body.speed (never jumping), face the travel direction, cycle the legs.
 *  Leg cadence is capped so a hurrying character jogs instead of blurring. Exported for tests. */
export function advance(body: Body, dt: number, cadence: number) {
  if (!body.moving || !body.path.length) return;
  const frame = Math.min(dt, 0.05);
  let budget = body.speed * frame;
  while (budget > 0 && body.path.length) {
    const target = body.path[0];
    const dx = target.x - body.pos.x, dz = target.z - body.pos.z, d = Math.hypot(dx, dz);
    if (d > 1e-4) body.face = Math.atan2(dx, dz);
    const step = Math.min(d, budget);
    if (d > 1e-4) body.pos = { x: body.pos.x + dx / d * step, z: body.pos.z + dz / d * step };
    budget -= step;
    if (d - step < 0.02) { body.pos = { ...target }; body.path.shift(); }
  }
  if (!body.path.length) { body.moving = false; body.arrive?.(); }
  body.walkPhase += frame * Math.min(body.speed, M.walk * 1.8) * cadence;
}

/** Wait for a walk or action to finish. Never snaps: on abort or timeout the body keeps moving on screen
 *  toward its target; only the queue moves on. (The queue gives each event ~1.6s; 3D walks can be longer.) */
function settle(body: Body, options: AnimationOptions, ms: number, onArrive = false) {
  return new Promise<void>(resolve => {
    let done = false;
    const end = () => { if (done) return; done = true; clearTimeout(timer); options.signal.removeEventListener('abort', end); resolve(); };
    const timer = setTimeout(end, ms);
    if (onArrive) body.arrive = end;
    if (options.signal.aborted) end(); else options.signal.addEventListener('abort', end, { once: true });
  });
}
/** Time budget per walk: normal events stroll, a backed-up queue makes characters hurry, never teleport. */
const walkBudget = (options: AnimationOptions) => options.speed === 'instant' ? M.budget.instant : options.speed === 'fast' ? M.budget.fast : M.budget.walk;
const actBudget = (options: AnimationOptions) => options.speed === 'instant' ? M.budget.actInstant : options.speed === 'fast' ? M.fastFactor : 1;

function walk(body: Body, to: XZ, options: AnimationOptions, pace = 1) {
  const points = route(body.pos, to);
  const length = points.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? points[i - 1] : body.pos).x, p.z - (i ? points[i - 1] : body.pos).z), 0);
  if (length < 0.05) return Promise.resolve();
  body.path = points; body.moving = true;
  body.speed = Math.min(M.maxSpeed, Math.max(M.walk * pace, length / walkBudget(options)));
  if (options.signal.aborted) return Promise.resolve();
  return settle(body, options, (length / body.speed) * 1000 + 150, true);
}

function act(body: Body, name: string, seconds: number, options: AnimationOptions, data?: number) {
  // Actions always show; a backed-up queue only shortens them.
  const duration = Math.max(0.18, seconds * actBudget(options));
  body.action = { name, start: now(), duration, data };
  if (options.signal.aborted) return Promise.resolve();
  return settle(body, options, duration * 1000);
}

/** Tini walks to the gate and hammers while it goes up (~3.5s). Only a reset/snapshot ('clear') cuts it short:
 *  the queue's catch-up abort is ignored here so the build is always seen; later Tini events hurry to catch up. */
async function buildGate(b: Body, options: AnimationOptions) {
  const gate = w({ x: L.gate.x, y: L.gate.y - D.gate.workFrom });
  await walk(b, gate, { ...options, signal: new AbortController().signal, speed: 'normal' });
  if (options.signal.reason === 'clear') return;
  b.face = Math.PI; // face the gate
  gateBuild.startAt = now();
  const seconds = D.gate.buildSeconds;
  b.action = { name: 'hammer', start: now(), duration: seconds, data: Math.round(seconds * 2) };
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, seconds * 1000);
    options.signal.addEventListener('abort', () => { if (options.signal.reason === 'clear') { clearTimeout(timer); resolve(); } });
  });
}

function speechSeconds(text: string) {
  return Math.min(M.speechMax, Math.max(M.speechMin, M.speechBase + text.length * M.speechPerChar));
}

// ---------------------------------------------------------------------------------------------
// The per-event choreography (event → what each character does). Mirrors the spec table.
// ---------------------------------------------------------------------------------------------
export async function animate(bodies: Record<AnimatedActor, Body>, event: EngineEvent, options: AnimationOptions) {
  if (event.actor === 'system') return;
  const b = bodies[event.actor];
  switch (event.type) {
    case 'speech': {
      b.speech = { text: event.text, until: now() + speechSeconds(event.text) };
      await act(b, 'talk', Math.min(3, Math.max(1.1, event.text.length * 0.03)), options);
      return;
    }
    // Tini ------------------------------------------------------------------------------------
    case 'fence.segment.built':
      if (gateBuild.startAt === null && gateBuild.progress < 1) await buildGate(b, options);
      await walk(b, atSegment(event.segment.id), options);
      await act(b, 'hammer', M.hammer, options);
      spark('dust', atSegment(event.segment.id, F.bumpApproach), 0.3, 0.8);
      return;
    case 'tini.carry.box':
      await walk(b, w(F.zones.gate), options);
      b.carrying = event.fileCount;
      await act(b, 'lift', 0.3, options);
      await walk(b, atSegment(event.segmentId), options, 0.8);
      await act(b, 'setdown', 0.35, options);
      b.carrying = undefined;
      spark('cards', atSegment(event.segmentId, F.bumpApproach * 0.4), 0.4, 1.1);
      return;
    // Dog ---------------------------------------------------------------------------------------
    case 'dog.brick.placed':
      await walk(b, w(F.zones.house), options, 1.3);
      await act(b, event.op, event.op === 'read' ? 0.55 : 0.4, options);
      if (event.op === 'run') spark('ring', b.pos, 0.8, 0.7);
      return;
    case 'fence.blocked': {
      const hit = atSegment(event.segmentId, F.bumpApproach);
      await walk(b, hit, options, 1.6);
      await act(b, 'bump', 0.35, options);
      spark('stars', b.pos, 1.3, 1.2);
      await walk(b, atSegment(event.segmentId, F.approach + 20), options, 1.2);
      return;
    }
    case 'dog.state':
      if (event.state === 'done') await act(b, 'spin', 0.8, options);
      return;
    // Tina --------------------------------------------------------------------------------------
    case 'tina.inspect.started': case 'tina.inspect.segment':
      await walk(b, event.segmentId ? atSegment(event.segmentId) : w(F.zones.yard), options);
      await act(b, 'scan', M.scan, options);
      return;
    case 'segment.red':
      await walk(b, atSegment(event.segmentId), options);
      spark('achoo', b.pos, 1.9, 0.8);
      await act(b, 'sneeze', 0.9, options);
      return;
    case 'segment.green':
      await act(b, 'thumbs', 0.6, options);
      spark('check', atSegment(event.segmentId, F.bumpApproach), 1.2, 0.6);
      return;
    case 'fix.applied': case 'finding.cleared':
      await act(b, 'nod', 0.55, options);
      return;
  }
}

// ---------------------------------------------------------------------------------------------
// Bodies: rounded primitives, posed every frame from the motion model.
// ---------------------------------------------------------------------------------------------
type Parts = { root: Group | null; body: Group | null; legL: Group | null; legR: Group | null; armL: Group | null; armR: Group | null; head: Group | null; tail: Group | null };

function usePose(body: Body, kind: AnimatedActor, parts: React.MutableRefObject<Parts>, world: WorldState) {
  useFrame((_, dt) => {
    const p = parts.current, t = now();
    if (!p.root || !p.body) return;
    // Walk along the path, turning smoothly toward travel.
    advance(body, dt, kind === 'dog' ? 5.5 : 4.2);
    const asking = kind === 'tini' && !!world.openEscalation && !body.moving;
    const wanted = asking ? Math.atan2(D.camera.position[0] - body.pos.x, D.camera.position[2] - body.pos.z) : body.face ?? body.yaw;
    const delta = ((wanted - body.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    body.yaw += delta * Math.min(1, dt * 8);
    p.root.position.set(body.pos.x, 0, body.pos.z);
    p.root.rotation.y = body.yaw;

    // Walk cycle: legs alternate, arms swing, body bobs. Idle: gentle breathing.
    const swing = body.moving ? Math.sin(body.walkPhase) : 0;
    const bob = body.moving ? Math.abs(Math.sin(body.walkPhase)) * 0.08 : Math.sin(t * 2) * 0.012;
    p.body.position.y = bob;
    if (p.legL) p.legL.rotation.x = swing * 0.6;
    if (p.legR) p.legR.rotation.x = -swing * 0.6;
    if (p.armL) p.armL.rotation.x = -swing * 0.5;
    if (p.armR) p.armR.rotation.x = swing * 0.5;
    if (p.head) { p.head.rotation.y = body.moving ? 0 : Math.sin(t * 0.7 + (kind === 'tina' ? 1 : 0)) * 0.25; p.head.rotation.x = 0; }
    p.body.rotation.set(0, 0, 0);
    p.body.scale.set(1, 1, 1);

    // Actions.
    const a = body.action, k = a ? Math.min(1, (t - a.start) / a.duration) : 0;
    if (a && k >= 1) body.action = undefined;
    if (a && k < 1) {
      if (a.name === 'hammer' && p.armR) p.armR.rotation.x = -1.2 - Math.abs(Math.sin(k * Math.PI * (a.data ?? 3))) * 1.4;
      if (a.name === 'lift' && p.armL && p.armR) { p.armL.rotation.x = p.armR.rotation.x = -1.2 * k; }
      if (a.name === 'setdown' && p.armL && p.armR) { p.armL.rotation.x = p.armR.rotation.x = -1.2 * (1 - k); p.body.rotation.x = Math.sin(k * Math.PI) * 0.3; }
      if (a.name === 'scan' && p.armR) { p.armR.rotation.x = -1.6; p.armR.rotation.z = Math.sin(k * Math.PI * 4) * 0.35; if (p.head) p.head.rotation.y = Math.sin(k * Math.PI * 4) * 0.4; }
      if (a.name === 'sneeze') { const s = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65; p.body.rotation.x = k < 0.35 ? -0.25 * s : 0.45 * s; p.body.scale.set(1 + 0.1 * s, 1 - 0.1 * s, 1); p.root.position.z -= Math.sin(k * Math.PI) * 0.25 * Math.cos(body.yaw); p.root.position.x -= Math.sin(k * Math.PI) * 0.25 * Math.sin(body.yaw); }
      if (a.name === 'thumbs' && p.armR) { p.armR.rotation.x = -2.6 * Math.sin(k * Math.PI); p.body.position.y += Math.sin(k * Math.PI) * 0.12; }
      if (a.name === 'nod' && p.head) p.head.rotation.x = Math.sin(k * Math.PI * 2) * 0.35;
      if (a.name === 'talk' && p.head) p.head.rotation.x = Math.sin(t * 14) * 0.06;
      if (a.name === 'write') p.body.position.y += Math.sin(k * Math.PI) * 0.25;
      if (a.name === 'edit') p.body.position.z = Math.sin(k * Math.PI) * 0.3;
      if (a.name === 'read' && p.head) { p.head.rotation.x = 0.5 * Math.sin(k * Math.PI); p.head.position.y += 0; }
      if (a.name === 'run' && p.head) p.head.rotation.x = -0.3 * Math.sin(k * Math.PI * 3);
      if (a.name === 'bump') { p.body.position.z = Math.sin(k * Math.PI) * 0.35; p.body.rotation.x = -Math.sin(k * Math.PI) * 0.35; }
      if (a.name === 'spin') { p.body.position.y += Math.sin(k * Math.PI) * 0.7; p.body.rotation.y = k * Math.PI * 2; }
    }
    // Dog moods from state: sleeping curls up, waiting sits, working/done wags.
    if (kind === 'dog') {
      // The mascot has no tail: it wiggles happily while working and bounces a little when done.
      if (!body.moving && !body.action && (world.dog === 'working' || world.dog === 'done')) { p.body.rotation.z = Math.sin(t * (world.dog === 'done' ? 5 : 7)) * 0.06; if (world.dog === 'done') p.body.position.y += Math.abs(Math.sin(t * 5)) * 0.05; }
      if (world.dog === 'sleeping' && !body.moving) { p.body.scale.set(1.1, 0.7, 0.9); p.body.position.y = -0.08 + Math.sin(t * 1.5) * 0.015; }
      if (world.dog === 'waiting' && !body.moving) p.body.rotation.x = -0.35;
    }
    if (kind === 'tini' && asking && p.armL && p.armR) { p.armL.rotation.x = p.armR.rotation.x = -1.3; }
  });
}

function Limb({ at, length, radius, color, refCb }: { at: [number, number, number]; length: number; radius: number; color: string; refCb: (g: Group | null) => void }) {
  return <group position={at} ref={refCb}>
    <mesh position={[0, -length / 2, 0]} castShadow><capsuleGeometry args={[radius, length - radius * 2, 4, 8]} /><meshStandardMaterial color={color} roughness={0.7} /></mesh>
  </group>;
}

function Person({ kind, body, world, children }: { kind: 'tini' | 'tina'; body: Body; world: WorldState; children?: ReactNode }) {
  const parts = useRef<Parts>({ root: null, body: null, legL: null, legR: null, armL: null, armR: null, head: null, tail: null });
  usePose(body, kind, parts, world);
  const c = kind === 'tini' ? { shirt: '#4f86c6', pants: '#35557d', skin: '#f2cfae', hair: '#6b4a2f' } : { shirt: '#a4679a', pants: '#7d4a74', skin: '#f5d4b8', hair: '#8a5a35' };
  const set = (key: keyof Parts) => (g: Group | null) => { parts.current[key] = g; };
  return <group ref={set('root')}>
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.38, 16]} /><meshBasicMaterial color="#000" transparent opacity={0.16} depthWrite={false} /></mesh>
    <group ref={set('body')}>
      <Limb at={[-0.13, 0.55, 0]} length={0.55} radius={0.1} color={c.pants} refCb={set('legL')} />
      <Limb at={[0.13, 0.55, 0]} length={0.55} radius={0.1} color={c.pants} refCb={set('legR')} />
      {kind === 'tina'
        ? <mesh position={[0, 0.78, 0]} castShadow><cylinderGeometry args={[0.22, 0.36, 0.62, 12]} /><meshStandardMaterial color={c.shirt} roughness={0.7} /></mesh>
        : <RoundedBox args={[0.5, 0.58, 0.32]} radius={0.12} position={[0, 0.82, 0]} castShadow><meshStandardMaterial color={c.shirt} roughness={0.7} /></RoundedBox>}
      <Limb at={[-0.32, 1.05, 0]} length={0.5} radius={0.08} color={c.shirt} refCb={set('armL')} />
      <group position={[0.32, 1.05, 0]} ref={set('armR')}>
        <mesh position={[0, -0.25, 0]} castShadow><capsuleGeometry args={[0.08, 0.34, 4, 8]} /><meshStandardMaterial color={c.shirt} roughness={0.7} /></mesh>
        {children}
      </group>
      <group position={[0, 1.34, 0]} ref={set('head')}>
        <mesh castShadow><sphereGeometry args={[0.27, 16, 14]} /><meshStandardMaterial color={c.skin} roughness={0.8} /></mesh>
        <mesh position={[-0.09, 0.03, 0.24]}><sphereGeometry args={[0.035, 8, 8]} /><meshBasicMaterial color="#1b2228" /></mesh>
        <mesh position={[0.09, 0.03, 0.24]}><sphereGeometry args={[0.035, 8, 8]} /><meshBasicMaterial color="#1b2228" /></mesh>
        {kind === 'tini'
          ? <group position={[0, 0.14, 0]}>
              <mesh castShadow><sphereGeometry args={[0.29, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#f4c430" roughness={0.5} /></mesh>
              <mesh position={[0, 0, 0.06]}><cylinderGeometry args={[0.36, 0.36, 0.04, 20]} /><meshStandardMaterial color="#e5b21e" roughness={0.5} /></mesh>
            </group>
          : <>
              <mesh position={[0, 0.06, -0.06]} castShadow><sphereGeometry args={[0.29, 16, 12]} /><meshStandardMaterial color={c.hair} roughness={0.9} /></mesh>
              <mesh position={[0, -0.18, -0.18]} castShadow><sphereGeometry args={[0.2, 12, 10]} /><meshStandardMaterial color={c.hair} roughness={0.9} /></mesh>
            </>}
      </group>
      {kind === 'tini' && <RoundedBox args={[0.34, 0.22, 0.18]} radius={0.04} position={[-0.42, 0.55, 0.05]} castShadow><meshStandardMaterial color="#d9534f" roughness={0.6} /></RoundedBox>}
      {kind === 'tina' && <RoundedBox args={[0.26, 0.34, 0.03]} radius={0.02} position={[-0.3, 0.8, 0.2]} rotation={[0.3, 0, 0]} castShadow><meshStandardMaterial color="#f3efe4" roughness={0.9} /></RoundedBox>}
      {kind === 'tini' && <CarryBox body={body} />}
      {kind === 'tini' && !!world.openEscalation && !body.moving && <group position={[0, 1.05, 0.45]}>
        <RoundedBox args={[0.5, 0.5, 0.05]} radius={0.04}><meshStandardMaterial color="#fffdf6" /></RoundedBox>
        <Html position={[0, 0, 0.04]} transform distanceFactor={D.sign.plaque} zIndexRange={[12, 0]}><div className="d3-ask">?</div></Html>
      </group>}
    </group>
    <Html position={[0, 2.05, 0]} transform sprite distanceFactor={D.sign.scale} zIndexRange={[12, 0]} className="d3-name">{kind === 'tini' ? 'Tini' : 'Tina'}</Html>
    <Bubble body={body} kind={kind} />
  </group>;
}

/** The agent: our own fuzzy mascot (the engine still calls this actor "dog"). Rounded body, face window, `›_` on the chest. */
function Dog({ body, world }: { body: Body; world: WorldState }) {
  const parts = useRef<Parts>({ root: null, body: null, legL: null, legR: null, armL: null, armR: null, head: null, tail: null });
  usePose(body, 'dog', parts, world);
  const set = (key: keyof Parts) => (g: Group | null) => { parts.current[key] = g; };
  const fur = '#3f6fd8', face = '#6f95ea', mark = '#f1e6cc';
  const asleep = world.dog === 'sleeping';
  const furMat = <meshStandardMaterial color={fur} roughness={1} />;
  return <group ref={set('root')}>
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.45, 16]} /><meshBasicMaterial color="#000" transparent opacity={0.16} depthWrite={false} /></mesh>
    <group scale={1.5}><group ref={set('body')}>
      {/* stubby legs */}
      {([[-0.17, 'legL'], [0.17, 'legR']] as const).map(([x, key]) => <group key={key} position={[x, 0.24, 0]} ref={set(key)}>
        <mesh position={[0, -0.12, 0]} castShadow><capsuleGeometry args={[0.11, 0.1, 4, 10]} />{furMat}</mesh>
      </group>)}
      {/* body: a tall soft capsule */}
      <mesh position={[0, 0.72, 0]} scale={[1, 1, 0.88]} castShadow><capsuleGeometry args={[0.36, 0.5, 8, 18]} />{furMat}</mesh>
      {/* arms hang from the shoulders and swing while walking */}
      {([[-0.4, 'armL'], [0.4, 'armR']] as const).map(([x, key]) => <group key={key} position={[x, 0.86, 0]} ref={set(key)}>
        <mesh position={[0, -0.2, 0]} rotation={[0, 0, x < 0 ? -0.12 : 0.12]} castShadow><capsuleGeometry args={[0.1, 0.24, 4, 10]} />{furMat}</mesh>
      </group>)}
      {/* face window, eyes and smile */}
      <group position={[0, 1.02, 0.25]} ref={set('head')}>
        <mesh scale={[1, 0.72, 0.4]}><sphereGeometry args={[0.24, 20, 14]} /><meshStandardMaterial color={face} roughness={0.9} /></mesh>
        {[-0.08, 0.08].map(x => asleep
          ? <mesh key={x} position={[x, 0.02, 0.09]}><boxGeometry args={[0.06, 0.012, 0.01]} /><meshBasicMaterial color="#0f1733" /></mesh>
          : <mesh key={x} position={[x, 0.02, 0.085]}><sphereGeometry args={[0.028, 10, 10]} /><meshBasicMaterial color="#0f1733" /></mesh>)}
        <mesh position={[0, -0.05, 0.085]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.035, 0.009, 6, 12, Math.PI]} /><meshBasicMaterial color="#0f1733" /></mesh>
      </group>
      {/* chest mark: a terminal prompt, our own emblem */}
      <group position={[0, 0.62, 0.33]}>
        <mesh position={[-0.07, 0.03, 0]} rotation={[0, 0, -0.7]}><boxGeometry args={[0.1, 0.035, 0.02]} /><meshStandardMaterial color={mark} /></mesh>
        <mesh position={[-0.07, -0.03, 0]} rotation={[0, 0, 0.7]}><boxGeometry args={[0.1, 0.035, 0.02]} /><meshStandardMaterial color={mark} /></mesh>
        <mesh position={[0.07, -0.06, 0]}><boxGeometry args={[0.12, 0.035, 0.02]} /><meshStandardMaterial color={mark} /></mesh>
      </group>
    </group></group>
    <Html position={[0, 2.45, 0]} transform sprite distanceFactor={D.sign.scale} zIndexRange={[12, 0]} className="d3-name">
      {asleep ? 'Agent · Zzz' : world.dog === 'waiting' ? 'Agent · ?' : 'Agent'}
    </Html>
    <Bubble body={body} kind="dog" />
  </group>;
}

/** The box Tini carries in both arms, with its file count; shown only while carrying (set mid-animation). */
function CarryBox({ body }: { body: Body }) {
  const group = useRef<Group>(null);
  const label = useRef<HTMLDivElement>(null);
  useFrame(() => {
    if (!group.current) return;
    group.current.visible = body.carrying !== undefined;
    if (label.current && body.carrying !== undefined) label.current.textContent = `${body.carrying} files`;
  });
  return <group ref={group} position={[0, 0.85, 0.42]} visible={false}>
    <RoundedBox args={[0.6, 0.42, 0.42]} radius={0.04} castShadow><meshStandardMaterial color="#d8a868" roughness={0.9} /></RoundedBox>
    <Html position={[0, 0.02, 0.23]} transform distanceFactor={D.sign.plaque} zIndexRange={[12, 0]}><div className="d3-box-count" ref={label} /></Html>
  </group>;
}

/** Speech bubble above a character: crisp HTML, length-based duration. */
function Bubble({ body, kind }: { body: Body; kind: AnimatedActor }) {
  const [text, setText] = useState<string | null>(null);
  useFrame(() => {
    const live = body.speech && body.speech.until > now() ? body.speech.text : null;
    if (live !== text) setText(live);
  });
  if (!text) return null;
  return <Html position={[0, kind === 'dog' ? 2.95 : 2.45, 0]} transform sprite distanceFactor={D.sign.scale} zIndexRange={[20, 0]}>
    <div className={`d3-bubble ${kind}`}><strong>{kind === 'tini' ? 'Tini' : kind === 'tina' ? 'Tina' : 'Agent'}</strong><p>{text}</p></div>
  </Html>;
}

/** Short-lived effects: dust puffs, dizzy stars, bark rings, paper cards, sneeze and check pops. */
function Effects() {
  const list = useSyncExternalStore(listener => { effects.listeners.add(listener); return () => { effects.listeners.delete(listener); }; }, () => effects.list, () => effects.list);
  return <>{list.map(e => <EffectView key={e.id} e={e} />)}</>;
}

function EffectView({ e }: { e: Effect }) {
  const group = useRef<Group>(null);
  const meshes = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    const k = Math.min(1, (now() - e.start) / e.duration);
    if (!group.current) return;
    group.current.visible = k < 1;
    meshes.current.forEach((m, i) => {
      if (!m) return;
      const a = (i / Math.max(1, meshes.current.length)) * Math.PI * 2 + k * (e.kind === 'stars' ? 7 : 0);
      if (e.kind === 'dust') { m.position.set(Math.cos(a) * (0.2 + k * 0.7), 0.1 + k * 0.4, Math.sin(a) * (0.2 + k * 0.7)); m.scale.setScalar(0.6 + k); }
      if (e.kind === 'stars') { m.position.set(Math.cos(a) * 0.35, 0.05 * Math.sin(k * 20 + i), Math.sin(a) * 0.35); m.rotation.y = k * 12; }
      if (e.kind === 'ring') { m.scale.setScalar(0.3 + k * 2.4); }
      if (e.kind === 'cards') { m.position.set(Math.cos(a) * k * 1.4, Math.sin(k * Math.PI) * 1.4, Math.sin(a) * k * 1.4); m.rotation.set(k * 6 + i, k * 4, 0); }
      const material = m.material as { opacity: number };
      material.opacity = 1 - k;
    });
  });
  const ref = (i: number) => (m: Mesh | null) => { meshes.current[i] = m; };
  const base: [number, number, number] = [e.at.x, e.y, e.at.z];
  if (e.kind === 'achoo' || e.kind === 'check') return <group ref={group} position={base}>
    <Html transform sprite distanceFactor={D.sign.scale} zIndexRange={[21, 0]}><div className={`d3-pop ${e.kind}`}>{e.kind === 'achoo' ? 'ACHOO!' : '✓'}</div></Html>
  </group>;
  return <group ref={group} position={base}>
    {e.kind === 'ring' && <mesh ref={ref(0)} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.5, 0.04, 6, 32]} /><meshBasicMaterial color="#ffffff" transparent /></mesh>}
    {e.kind === 'dust' && Array.from({ length: 6 }, (_, i) => <mesh key={i} ref={ref(i)}><icosahedronGeometry args={[0.1, 0]} /><meshBasicMaterial color="#e9dcc2" transparent /></mesh>)}
    {e.kind === 'stars' && Array.from({ length: 4 }, (_, i) => <mesh key={i} ref={ref(i)}><octahedronGeometry args={[0.09, 0]} /><meshBasicMaterial color="#ffd54a" transparent /></mesh>)}
    {e.kind === 'cards' && Array.from({ length: 7 }, (_, i) => <mesh key={i} ref={ref(i)}><planeGeometry args={[0.2, 0.26]} /><meshBasicMaterial color="#fffdf6" transparent side={2} /></mesh>)}
  </group>;
}

/** Two wooden gate doors hinged on the gate posts. The gate stays closed; the doors appear as Tini finishes it. */
function GateDoors() {
  const left = useRef<Group>(null), right = useRef<Group>(null);
  const g = w({ x: L.gate.x, y: L.gate.y }), half = (L.gate.width * D.unit) / 2;
  useFrame(() => {
    // Hidden before fencing starts; the doors go in during the last part of the build.
    const hang = Math.min(1, Math.max(0, (gateBuild.progress - 0.82) / 0.18));
    for (const door of [left.current, right.current]) if (door) { door.visible = hang > 0; door.scale.set(1, Math.max(0.001, hang), 1); }
  });
  const door = (side: -1 | 1, ref: React.RefObject<Group | null>) => <group ref={ref} position={[g.x + side * half, 0, g.z]}>
    {/* The door extends from its hinge toward the gate's middle: two rails and three slats. */}
    {[0.45, 1.05].map(y => <RoundedBox key={y} args={[half - 0.12, 0.12, 0.1]} radius={0.03} position={[-side * (half / 2 + 0.02), y, 0]} castShadow>
      <meshStandardMaterial color={D.colors.wood} roughness={0.85} />
    </RoundedBox>)}
    {[0.2, 0.5, 0.8].map(k => <RoundedBox key={k} args={[0.12, 0.95, 0.08]} radius={0.03} position={[-side * (0.14 + k * (half - 0.3)), 0.75, 0]} castShadow>
      <meshStandardMaterial color={D.colors.woodDark} roughness={0.85} />
    </RoundedBox>)}
  </group>;
  return <>{door(-1, left)}{door(1, right)}</>;
}

/** The family: attaches to the per-actor animation queues (only one yard view is mounted at a time). */
export function Family3D() {
  const bodies = useFamily();
  const { world, epoch } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => animationQueues.attach((event, options) => animate(bodies, event, options)), [bodies]);
  // Snapshot or reset: no history is replayed; everyone stands at their staging point.
  useEffect(() => {
    const w0 = store.getSnapshot().world;
    for (const actor of ['tini', 'tina', 'dog'] as const) Object.assign(bodies[actor], { pos: home(actor, w0), path: [], moving: false, action: undefined, carrying: undefined, speech: undefined });
  }, [epoch, bodies]);
  return <>
    <Person kind="tini" body={bodies.tini} world={world}>
      <group position={[0, -0.5, 0.05]}>
        <mesh position={[0, -0.08, 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.025, 0.025, 0.34, 6]} /><meshStandardMaterial color="#8a6242" /></mesh>
        <RoundedBox args={[0.18, 0.08, 0.08]} radius={0.02} position={[0, -0.08, 0.3]} castShadow><meshStandardMaterial color="#6d7580" /></RoundedBox>
      </group>
    </Person>
    <Person kind="tina" body={bodies.tina} world={world}>
      <group position={[0, -0.52, 0.1]}>
        <mesh position={[0, 0.05, 0.1]} castShadow><cylinderGeometry args={[0.025, 0.025, 0.22, 6]} /><meshStandardMaterial color="#5b4636" /></mesh>
        <mesh position={[0, 0.2, 0.1]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.09, 0.02, 6, 16]} /><meshStandardMaterial color="#3d4450" /></mesh>
        <mesh position={[0, 0.2, 0.1]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.08, 16]} /><meshStandardMaterial color="#bfe8ff" transparent opacity={0.6} emissive="#bfe8ff" emissiveIntensity={0.4} /></mesh>
      </group>
    </Person>
    <Dog body={bodies.dog} world={world} />
    <GateDoors />
    <Effects />
  </>;
}
