import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameCommand, WorldState } from '../../../shared/events.ts';
import { promptCommand } from './promptMode.ts';
import { ChatHistory, DEFAULT_PROMPT, StopButton, Summary } from './Project.tsx';
import { STOPPABLE } from '../store.ts';

const SUGGESTIONS = ['Add a careers page using the job descriptions in ~/Documents/Rivera-HR', 'Make the header darker'];

/** Game page message bar: one wide field under the yard, Send or Stop on the right, history on demand.
 *  Same rules as PromptBar: `start` when idle, `prompt` when ready or launched, nothing while the crew works. */
export function Composer({ world, send, available, pending, epoch }: { world: WorldState; send: (command: GameCommand) => boolean; available: boolean; pending: string[]; epoch: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const suggested = world.suggestedPrompt ?? null;
  useEffect(() => { setDraft(null); }, [epoch, suggested]);
  const text = draft ?? suggested ?? (world.phase === 'idle' ? DEFAULT_PROMPT : '');
  const command = promptCommand(world.phase, text.trim());
  const waiting = pending.includes('start') || pending.includes('prompt');
  const working = !command;
  const first = world.phase === 'idle';
  // Grow with the text, up to about four lines, like a chat app's message box.
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text, working]);
  const submit = () => { if (command && text.trim() && send(command)) setDraft(''); };
  const last = world.turns.at(-1);
  const turns = world.turns.length;
  const status = `${turns ? `Turn ${turns} · ` : ''}${world.phase}${world.launchUnlocked && world.phase !== 'launched' ? ' · launch unlocked' : ''}`;

  return <section className="composer" aria-label="Message the crew">
    <div className="composer-history" hidden={!historyOpen} aria-label="Conversation history"><ChatHistory world={world} /></div>
    <div className="composer-above">
      {turns > 0 && <button type="button" className="history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen(open => !open)}>{historyOpen ? 'Hide history' : `History · ${turns} ${turns === 1 ? 'turn' : 'turns'}`}</button>}
      {last?.summary && !historyOpen && <div className="composer-last"><span>Claude</span><Summary text={last.summary} /></div>}
      {!first && !working && !text && <div className="prompt-suggestions">{SUGGESTIONS.map(suggestion => <button type="button" key={suggestion} className="chip" onClick={() => setDraft(suggestion)}>{suggestion}</button>)}</div>}
    </div>
    <form className={`composer-bar prompt-bar ${working ? 'working' : ''}`} onSubmit={e => { e.preventDefault(); submit(); }}>
      <label htmlFor="prompt-input" className="gv-sr">{first ? 'Start a project' : 'Message the crew'}</label>
      <textarea id="prompt-input" ref={box} rows={1} value={working ? '' : text} disabled={!available || working || waiting}
        placeholder={working ? 'Tini is working…' : first ? 'Tell the crew what to build…' : 'Message the crew…'}
        onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
      {working
        ? STOPPABLE.includes(world.phase) ? <StopButton world={world} send={send} available={available} pending={pending} /> : <span className="working-dot" aria-hidden="true" />
        : <button className="send" aria-label={first ? 'Start' : 'Send'} disabled={!available || waiting || !text.trim()}>{waiting ? '…' : '↑'}</button>}
    </form>
    <div className="composer-foot"><span>Tini fences only what the job needs. Tina checks everything before launch.</span><span className="composer-status" role="status">{working ? 'Tini is working · ' : ''}{status}</span></div>
  </section>;
}
