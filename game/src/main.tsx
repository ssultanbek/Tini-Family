import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { connectEngine } from './net.ts';
import { Dashboard } from './ui/Dashboard.tsx';
import { GameView } from './ui/GameView.tsx';
import './ui/styles.css';

// The 3D diorama loads only on /?view=3d, so the 2D yard and the dashboard never download three.js.
const Yard3D = lazy(() => import('./scene3d/Yard3D.tsx'));

const engine = connectEngine();
const view = new URLSearchParams(window.location.search).get('view');
// `/` is the game; `/?view=dashboard` is the frozen emergency fallback (Dashboard.tsx, never redesigned).
createRoot(document.getElementById('root')!).render(
  view === 'dashboard' ? <Dashboard send={engine.send} />
  : view === '3d' ? <GameView send={engine.send} stage={<Suspense fallback={<p className="gv-notice" role="status">Loading the 3D yard…</p>}><Yard3D /></Suspense>} />
  : <GameView send={engine.send} />);
