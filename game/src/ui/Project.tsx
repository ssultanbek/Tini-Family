import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameCommand, WorldState } from '../../../shared/events.ts';
import { promptCommand } from './promptMode.ts';
import { STOPPABLE } from '../store.ts';
import { clampText } from './clampText.ts';

export const DEFAULT_PROMPT = "Build a modern, serious-looking website for Rivera Construction with a gallery of this year's projects. Use the photos in ~/Clients/Rivera/Photos and the company info in ~/Clients/Rivera/About and ~/Clients/Rivera/Services.";
// The box stays active with open findings on purpose: Maria can ask Claude to fix things herself.
export const OPEN_FINDINGS_PLACEHOLDER = 'Fix the red spots before launching, or ask for a change';
// Typing helpers only: they fill the box, the engine decides what happens.
const SUGGESTIONS = ['Add a careers page using the job descriptions in ~/Documents/Rivera-HR', 'Make the header darker'];

/** Always on screen. Sends `start` when idle, `prompt` when ready or launched, nothing otherwise. */
export function PromptBar({ world, send, available, pending, epoch, compact = false }: { world: WorldState; send: (command: GameCommand) => boolean; available: boolean; pending: string[]; epoch: number; compact?: boolean }) {
  // Until Maria types, the box shows the engine's suggestion (v1.2 `prompt.suggested`, used by replays),
  // else the example for the very first prompt. A new suggestion replaces whatever was typed.
  const [draft, setDraft] = useState<string | null>(null);
  const suggested = world.suggestedPrompt ?? null;
  useEffect(() => { setDraft(null); }, [epoch, suggested]);
  const text = draft ?? suggested ?? (world.phase === 'idle' ? DEFAULT_PROMPT : '');
  const setText = (value: string) => setDraft(value);
  const command = promptCommand(world.phase, text.trim());
  const waiting = pending.includes('start') || pending.includes('prompt');
  const working = !command;
  const first = world.phase === 'idle';
  const disabled = !available || working || waiting;
  const submit = () => { if (command && text.trim() && send(command)) setText(''); };
  // While the crew works the bar can't send anything, so it shrinks to one line and covers no cards.
  if (working) return <div className="prompt-bar working"><span className="working-dot" aria-hidden="true" /><span role="status">{compact ? 'Tini is working…' : 'Tini is working… you can prompt again when the crew is done.'}</span>
    {STOPPABLE.includes(world.phase) && <StopButton world={world} send={send} available={available} pending={pending} />}</div>;
  return <form className={`prompt-bar ${working ? 'working' : ''}`} onSubmit={e => { e.preventDefault(); submit(); }}>
    <label htmlFor="prompt-input">{compact ? (first ? 'First request' : 'Next request') : first ? 'Start a project: tell the crew what you need' : 'What next? Same project, same fence'}</label>
    <div className="prompt-row">
      <textarea id="prompt-input" rows={1} value={text} disabled={disabled} placeholder={world.findings.length ? OPEN_FINDINGS_PLACEHOLDER : 'Ask for the next thing…'}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
      <button disabled={disabled || !text.trim()}>{waiting ? 'Sent…' : first ? 'Start' : 'Send'}</button>
    </div>
    {!first && !working && !text && <div className="prompt-suggestions">{SUGGESTIONS.filter(suggestion => !world.turns.some(turn => turn.prompt.trim() === suggestion)).map(suggestion => <button type="button" key={suggestion} className="secondary chip" onClick={() => setText(suggestion)}>{suggestion}</button>)}</div>}
  </form>;
}

/** Every prompt in this project with Claude's summary once the engine sends it. */
export function TurnHistory({ world }: { world: WorldState }) {
  if (!world.turns.length) return <p className="muted">{world.prompt ?? 'No prompts yet. Use the prompt bar to start the project.'}</p>;
  return <ol className="turns">
    <AnimatePresence initial={false}>{world.turns.map(turn => <motion.li key={turn.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <span className="turn-number">Turn {turn.id}</span>
      <p className="turn-prompt">{turn.prompt}</p>
      {turn.summary ? <Summary text={turn.summary} /> : <p className="turn-summary working">⋯ The crew is on it</p>}
    </motion.li>)}</AnimatePresence>
  </ol>;
}

/** v1.2 `stop`: two clicks, so a stray click during the demo can't end a turn. */
function StopButton({ world, send, available, pending }: { world: WorldState; send: (command: GameCommand) => boolean; available: boolean; pending: string[] }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const timer = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(timer); }, [armed]);
  // In the first turn's setup the engine drops back to the start; later it ends the turn and Tina still checks.
  const setup = world.turns.length <= 1 && world.phase !== 'building';
  const stopping = pending.includes('stop');
  return <button type="button" className={`stop-button ${armed ? 'armed' : ''}`} disabled={!available || stopping}
    onClick={() => { if (!armed) { setArmed(true); return; } setArmed(false); send({ type: 'stop' }); }}>
    {stopping ? 'Stopping…' : armed ? (setup ? 'Really stop? Setup is cancelled' : 'Really stop? Tina still checks') : '■ Stop'}
  </button>;
}

/** A turn summary; long ones collapse to a preview with more/less. */
export function Summary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const preview = clampText(text);
  return <p className="turn-summary">✓ {open || !preview ? text : preview}
    {preview && <> <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'less' : 'more'}</button></>}</p>;
}

/** The game page's chat: each turn is your prompt, then Claude's summary (or a typing indicator). */
/** The game page's turn timeline: one card per turn with the request and its result (no chat bubbles). */
export function TurnTimeline({ world }: { world: WorldState }) {
  // While the crew waits on you, say so instead of showing progress.
  const pending = world.phase === 'contract' && world.contract ? 'Waiting for your OK' : world.openEscalation ? 'Waiting for your answer' : 'In progress…';
  if (!world.turns.length) return <p className="timeline-empty">No requests yet. Tini fences only what each request needs.</p>;
  return <ol className="timeline" aria-label="Turns">
    <AnimatePresence initial={false}>{world.turns.map(turn => <motion.li key={turn.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`turn-card ${turn.summary ? 'done' : 'open'}`}>
      <div className="turn-card-head"><span className="turn-number">Turn {turn.id}</span><span className="turn-state">{turn.summary ? '✓ Done' : pending}</span></div>
      <span className="turn-label">Request</span>
      <p className="turn-request">{turn.prompt}</p>
      <span className="turn-label">Result</span>
      {turn.summary ? <Summary text={turn.summary} /> : <p className="turn-pending">{pending}</p>}
    </motion.li>)}</AnimatePresence>
  </ol>;
}
