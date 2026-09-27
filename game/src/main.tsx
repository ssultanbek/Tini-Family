import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { connectEngine } from './net.ts';
import { Dashboard } from './ui/Dashboard.tsx';
import { GameView } from './ui/GameView.tsx';
import './ui/styles.css';

// The 3D diorama loads lazily, so the 2D backup and the dashboard never download three.js.
const Yard3D = lazy(() => import('./scene3d/Yard3D.tsx'));

const engine = connectEngine();
const view = new URLSearchParams(window.location.search).get('view');
// `/` (and the old `/?view=3d`) is the 3D diorama; `/?view=2d` keeps the 2D pixel yard as a backup;
// `/?view=dashboard` is the frozen emergency fallback (Dashboard.tsx, never redesigned).
createRoot(document.getElementById('root')!).render(
  view === 'dashboard' ? <Dashboard send={engine.send} />
  : view === '2d' ? <GameView send={engine.send} />
  : <GameView send={engine.send} stage={<Suspense fallback={<p className="gv-notice" role="status">Loading the 3D yard…</p>}><Yard3D /></Suspense>} />);
