import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { GameCommand, WorldState } from '../../../shared/events.ts';
import { promptCommand } from './promptMode.ts';

export const DEFAULT_PROMPT = 'Build a modern, serious-looking website for Rivera Construction. Use the photos in /Clients/Rivera/Photos and the company info in /Clients/Rivera/About and /Clients/Rivera/Services.';
// Typing helpers only: they fill the box, the engine decides what happens.
const SUGGESTIONS = ['Add a careers page using the job descriptions in ~/Documents/Rivera-HR', 'Make the header darker'];

/** Always on screen. Sends `start` when idle, `prompt` when ready or launched, nothing otherwise. */
export function PromptBar({ world, send, available, pending, epoch }: { world: WorldState; send: (command: GameCommand) => boolean; available: boolean; pending: string[]; epoch: number }) {
  // Until Maria types, the box offers the example only for the very first prompt.
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [epoch]);
  const text = draft ?? (world.phase === 'idle' ? DEFAULT_PROMPT : '');
  const setText = (value: string) => setDraft(value);
  const command = promptCommand(world.phase, text.trim());
  const waiting = pending.includes('start') || pending.includes('prompt');
  const working = !command;
  const first = world.phase === 'idle';
  const disabled = !available || working || waiting;
  const submit = () => { if (command && text.trim() && send(command)) setText(''); };
  return <form className={`prompt-bar ${working ? 'working' : ''}`} onSubmit={e => { e.preventDefault(); submit(); }}>
    <label htmlFor="prompt-input">{first ? 'Start a project: tell the crew what you need' : working ? 'Tini is working…' : 'What next? Same project, same fence'}</label>
    <div className="prompt-row">
      <textarea id="prompt-input" rows={1} value={text} disabled={disabled} placeholder={working ? 'Tini is working… you can prompt again when the crew is done.' : 'Ask for the next thing…'}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
      <button disabled={disabled || !text.trim()}>{waiting ? 'Sent…' : first ? 'Start' : 'Send'}</button>
    </div>
    {!first && !working && !text && <div className="prompt-suggestions">{SUGGESTIONS.map(suggestion => <button type="button" key={suggestion} className="secondary chip" onClick={() => setText(suggestion)}>{suggestion}</button>)}</div>}
  </form>;
}

/** Every prompt in this project with Claude's summary once the engine sends it. */
export function TurnHistory({ world }: { world: WorldState }) {
  if (!world.turns.length) return <p className="muted">{world.prompt ?? 'No prompts yet. Type in the bar at the bottom to start the project.'}</p>;
  return <ol className="turns">
    <AnimatePresence initial={false}>{world.turns.map(turn => <motion.li key={turn.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <span className="turn-number">Turn {turn.id}</span>
      <p className="turn-prompt">{turn.prompt}</p>
      {turn.summary ? <p className="turn-summary">✓ {turn.summary}</p> : <p className="turn-summary working">⋯ The crew is on it</p>}
    </motion.li>)}</AnimatePresence>
  </ol>;
}
