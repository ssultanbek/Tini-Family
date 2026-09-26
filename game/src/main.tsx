import { createRoot } from 'react-dom/client';
import { connectEngine } from './net.ts';
import { Dashboard } from './ui/Dashboard.tsx';
import { Yard } from './ui/Yard.tsx';
import './ui/styles.css';

const engine = connectEngine();
const dashboard = new URLSearchParams(window.location.search).get('view') === 'dashboard';
createRoot(document.getElementById('root')!).render(<Dashboard send={engine.send} yard={dashboard ? undefined : <Yard />} />);
