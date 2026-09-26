import { createRoot } from 'react-dom/client';
import { connectEngine } from './net.ts';
import { Dashboard } from './ui/Dashboard.tsx';
import { GameView } from './ui/GameView.tsx';
import './ui/styles.css';

const engine = connectEngine();
const dashboard = new URLSearchParams(window.location.search).get('view') === 'dashboard';
// `/` is the game; `/?view=dashboard` is the frozen emergency fallback (Dashboard.tsx, never redesigned).
createRoot(document.getElementById('root')!).render(dashboard ? <Dashboard send={engine.send} /> : <GameView send={engine.send} />);
