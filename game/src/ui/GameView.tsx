import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { EngineEvent, GameCommand, SegmentStatus } from '../../../shared/events.ts';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { commandKey, store } from '../store.ts';
import { fixedAwaitingGreen } from './fixedFindings.ts';
import { ReportScreen } from './Report.tsx';
import { RawView } from './RawView.tsx';
import { PromptBar, TurnTimeline } from './Project.tsx';
import { reportVisible, type ReportMode } from './promptMode.ts';
import { gameLayout } from '../layout.ts';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import './game.css';
import { Yard } from './Yard.tsx';

const statusLabels: Record<SegmentStatus, string> = { planned: '○ Planned', built: '▤ Built', inspecting: '◉ Inspecting', red: '! Red · needs fix', green: '✓ Green' };
const names = { tini: 'Tini', tina: 'Tina', dog: 'Dog', system: 'System' };
function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}><h2>{title}</h2>{children}</section>;
}
const cardMotion = {
  initial: { opacity: 0, x: 48, scale: .97 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 420, damping: 32 } },
  exit: { opacity: 0, x: 64, scale: .95, transition: { duration: .25 } },
};
/** Cards that come and go with engine state. State decides; motion only decorates. */
// A fixed finding holds its green state briefly before leaving, so it can be read at --speed 5.
const fixedExit = { ...cardMotion.exit, transition: { delay: .7, duration: .35 } };
function MotionCard({ title, children, className = '', lingering = false }: { title: string; children: ReactNode; className?: string; lingering?: boolean }) {
  return <motion.section layout className={`card ${className}`} {...cardMotion} exit={lingering ? fixedExit : cardMotion.exit}><h2>{title}</h2>{children}</motion.section>;
}
function Lines({ items }: { items: string[] }) { return items.length ? <ul>{items.map((line, i) => <li key={i}>{line}</li>)}</ul> : <p className="muted">None reported.</p>; }
function describe(event: EngineEvent): string {
  switch (event.type) {
    case 'speech': case 'user.prompt': return event.text;
    case 'turn.started': return `Turn ${event.turnId}: ${event.prompt}`;
    case 'turn.finished': return `Turn ${event.turnId}: ${event.summary}`;
    case 'launch.locked': return event.reason;
    case 'raw.log': return `Channel: ${event.channel} · open raw view for details`;
    case 'session.phase': return event.phase;
    case 'dog.state': return event.state;
    case 'dog.brick.placed': return `${event.op} ${event.file} · ${event.bricks} bricks`;
    case 'fence.segment.built': return event.segment.label;
    case 'fence.plan.proposed': return event.contract.title;
    case 'fence.blocked': return `${event.target}: ${event.reason}${event.simulated ? ' (simulated attack)' : ''}`;
    case 'escalation.opened': return event.ask;
    case 'escalation.resolved': case 'fix.applied': return event.summary;
    case 'segment.red': return event.finding.title;
    case 'tini.carry.box': return `${event.fileCount} files · ${event.segmentId}`;
    case 'tina.inspect.segment': case 'segment.green': return event.segmentId;
    case 'tina.inspect.started': return `${event.scope}${event.segmentId ? ` · ${event.segmentId}` : ''}`;
    case 'tina.inspect.finished': return `${event.scope} · ${event.redCount} red`;
    case 'finding.cleared': return `${event.findingId}: ${event.reason}`;
    case 'engine.error': return event.message;
    case 'launch.done': return event.url ?? 'Launch complete';
    default: return '';
  }
}

/** The game view at `/`: chat | yard | analysis. Split from Dashboard.tsx so it can be redesigned while the dashboard stays frozen. */
export function GameView({ send, stage }: { send: (command: GameCommand) => boolean; stage?: ReactNode }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { world, events, pending, connected, synced } = state;
  const [adjustment, setAdjustment] = useState('');
  const [adjustSent, setAdjustSent] = useState(false);
  const [raw, setRaw] = useState(false);
  const [reportMode, setReportMode] = useState<ReportMode>('auto');
  const log = useRef<HTMLDivElement>(null);
  const analysis = useRef<HTMLElement>(null);
  const chat = useRef<HTMLDivElement>(null);
  const available = connected && synced;
  const busy = (command: GameCommand) => !available || pending.includes(commandKey(command));
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [events.length, raw]);
  useEffect(() => { setAdjustSent(false); setAdjustment(''); setReportMode('auto'); }, [state.epoch]);
  useEffect(() => { setReportMode('auto'); }, [world.turns.length]);
  const escalation = world.openEscalation;
  const fixed = fixedAwaitingGreen(world, events);
  const siteUrl = events.reduce<string | undefined>((url, event) => event.type === 'launch.done' ? event.url : url, undefined);
  const lockReason = events.reduce<string | undefined>((reason, event) => event.type === 'launch.locked' ? event.reason : event.type === 'launch.unlocked' ? undefined : reason, undefined);
  const showReport = reportVisible(reportMode, world.phase, !!world.report);
  const latestBlock = world.blocked.at(-1);
  const needsYou = !!world.contract || !!escalation || world.findings.length > 0 || fixed.length > 0;
  const launch: GameCommand = { type: 'launch' };
  // A new decision (plan, request, red finding) brings the Needs-you cards back into view.
  const decisions = [world.contract?.title, escalation?.escalationId, ...world.findings.map(finding => finding.id)].join('|');
  useEffect(() => { if (decisions && analysis.current) analysis.current.scrollTop = 0; }, [decisions]);
  // The chat follows the newest message, like a messenger.
  const lastTurn = world.turns.at(-1);
  useEffect(() => { if (chat.current) chat.current.scrollTop = chat.current.scrollHeight; }, [world.turns.length, lastTurn?.summary, world.phase]);

  return <MotionConfig reducedMotion="user"><div className="app game-app gv" style={gameLayout as CSSProperties}>
    <header className="gv-top">
      <span className="gv-logo" aria-hidden="true" />
      <div className="gv-brand"><h1>Tini Family</h1><p>Your agent gets the keys to the room, not the house.</p></div>
      <div className="gv-actions">
        <span role="status" className={`gv-pill ${connected ? 'ok' : 'bad'}`}>{connected ? synced ? '● Live' : '● Syncing' : '○ Offline'}</span>
        <button className={`gv-btn ghost raw-toggle ${raw ? 'on' : ''}`} aria-pressed={raw} onClick={() => setRaw(on => !on)}>{'{ }'} Raw</button>
        <a className="gv-link" href="/?view=dashboard">Dashboard</a>
        <button className="gv-btn ghost" disabled={busy({ type: 'reset' })} onClick={() => send({ type: 'reset' })}>{pending.includes('reset') ? 'Resetting…' : 'Reset'}</button>
      </div>
    </header>
    {!available && <p className="gv-notice" role="status">{state.connectionError || (connected ? 'Waiting for the engine snapshot…' : 'Waiting for the engine at localhost:4000…')}</p>}
    {state.engineError && <p className="gv-notice bad" role="alert">Engine error: {state.engineError}</p>}

    <main className="gv-cols">
      <aside className="gv-panel gv-chat-panel" aria-label="Turns">
        <h2>Turns</h2>
        <div className="gv-chat-scroll" ref={chat}><TurnTimeline world={world} /></div>
        <PromptBar compact world={world} send={send} available={available} pending={pending} epoch={state.epoch} />
      </aside>

      <section className="gv-center" aria-label="The yard">{stage ?? <Yard />}</section>

      <aside className="gv-panel gv-analysis" aria-label="Analysis" ref={analysis}>
        <h2>Analysis</h2>
        <section className="gv-needs" aria-label="Needs you">
          <span className="gv-label">{needsYou ? 'Needs you' : 'All quiet'}</span>
          {!needsYou && <p className="gv-quiet">Nothing to decide right now.</p>}
          <AnimatePresence initial={false}>
          {world.contract && <MotionCard key="contract" title={world.contract.title} className="action-card">
            {/* The decision first; the engine's detail lines follow, so Approve never hides below the fold. */}
            <button className="gv-btn" disabled={busy({ type: 'approve.plan' }) || world.phase !== 'contract'} onClick={() => send({ type: 'approve.plan' })}>{pending.includes('approve.plan') ? 'Approving…' : world.phase === 'contract' ? 'Approve' : 'Tini is updating the plan…'}</button>
            <details className="gv-adjust"><summary>Ask for a change</summary>
              <form className="adjust" onSubmit={e => { e.preventDefault(); if (send({ type: 'adjust.plan', text: adjustment.trim() })) setAdjustSent(true); }}>
                <label htmlFor="adjustment" className="gv-sr">Requested change</label>
                <textarea id="adjustment" value={adjustment} onChange={e => { setAdjustment(e.target.value); setAdjustSent(false); }} />
                <button className="gv-btn ghost" disabled={!available || !adjustment.trim() || adjustSent || world.phase !== 'contract'}>Adjust</button>
                {adjustSent && <p role="status" className="gv-small">Sent. Tini is updating the plan…</p>}
              </form>
            </details>
            <span className="gv-label">Allowed</span><Lines items={world.contract.allowed} />
            {world.contract.stripped.length > 0 && <><span className="gv-label">Removed first</span><Lines items={world.contract.stripped} /></>}
            <p className="gv-small">{world.contract.outside}</p>
          </MotionCard>}
          {escalation && <MotionCard key={escalation.escalationId} title={escalation.source === 'prompt' ? 'Your request needs something outside the fence' : 'Claude is asking for more'} className="action-card">
            <p>{escalation.ask}</p><p className="path">{escalation.requested}</p>
            <span className="gv-label">Tina checked {escalation.inspection.totalFiles.toLocaleString()} files</span>
            <ul className="gv-counts">{escalation.inspection.highlights.map((item, i) => <li key={i} className={`sev-${item.severity}`}><strong>{item.count.toLocaleString()}</strong> {item.label}</li>)}</ul>
            <div className="gv-options">{escalation.options.map(option => <button key={option.id} className={`option ${option.recommended ? 'recommended' : 'secondary'}`} disabled={busy({ type: 'escalation.choose', escalationId: escalation.escalationId, optionId: option.id })} onClick={() => send({ type: 'escalation.choose', escalationId: escalation.escalationId, optionId: option.id })}>{option.recommended && <span className="recommend-label">★ Recommended</span>}<strong>{option.label}</strong><span>{option.detail}</span></button>)}</div>
            {pending.includes(`escalation:${escalation.escalationId}`) && <p role="status" className="gv-small">Choice sent…</p>}
          </MotionCard>}
          {world.findings.map(finding => <MotionCard key={finding.id} title={finding.title} className="finding">
            <p className={`gv-chip bad`}>⚠ {finding.severity} · {finding.segmentId}</p><p>{finding.explanation}</p>{raw && finding.file && <p className="path">{finding.file}</p>}
            <div className="button-row">{finding.fixes.map(fix => <button key={fix.id} className="gv-btn" disabled={busy({ type: 'fix.apply', findingId: finding.id, fixId: fix.id })} onClick={() => send({ type: 'fix.apply', findingId: finding.id, fixId: fix.id })}>{fix.label}</button>)}</div>
            {pending.includes(`fix:${finding.id}`) && <p role="status" className="gv-small">Fixing…</p>}
          </MotionCard>)}
          {fixed.map(({ finding, summary, how }) => <MotionCard key={finding.id} title={finding.title} className="finding fixed" lingering><p className="gv-chip ok">✓ {how === 'cleared' ? 'Cleared' : 'Fixed'} · {finding.segmentId}</p><p>{summary}</p></MotionCard>)}
          </AnimatePresence>
        </section>

        <div className="gv-stats"><div><b>{world.bricks}</b><span>Bricks</span></div><div><b>{world.segments.length}</b><span>Fences</span></div><div><b>{world.blocked.length}</b><span>Blocked</span></div></div>

        <section className="gv-launch" aria-label="Launch">
          <button className="gv-btn big" disabled={!world.launchUnlocked || world.phase === 'launched' || busy(launch)} onClick={() => send(launch)}>{world.phase === 'launched' ? '✓ Launched' : pending.includes('launch') ? 'Launching…' : world.launchUnlocked ? 'Launch' : '🔒 Launch'}</button>
          {!world.launchUnlocked && lockReason && <p className="lock-reason" role="status">🔒 {lockReason}</p>}
          {world.report && !showReport && <button className="gv-btn ghost report-reopen" onClick={() => setReportMode('open')}>Show access report</button>}
        </section>

        {world.segments.length > 0 && <section aria-label="Fence"><span className="gv-label">Fence</span>
          <ul className="gv-fence">{world.segments.map(segment => <li key={segment.id}><span>{segment.label}</span><span className={`gv-status ${segment.status}`}>{statusLabels[segment.status]}</span></li>)}</ul></section>}

        {latestBlock && <section className="gv-block" aria-label="Latest blocked attempt" aria-live="polite"><span className="gv-label">Last blocked</span>
          <p className="path">{latestBlock.target}</p>{latestBlock.simulated && <span className="tag">Simulated attack</span>}<p className="gv-small">{latestBlock.reason}</p></section>}

        <details className="gv-log"><summary>Event log · {events.length}</summary>
          <div className="event-log" ref={log} role="log" aria-label="Engine event log" aria-live="off">{events.map((event, i) => <article key={`${event.seq}-${i}`} className="event"><div className="event-meta">#{event.seq} · {names[event.actor]}</div><strong>{event.type}</strong><p>{describe(event)}</p></article>)}{!events.length && <p className="gv-small">Waiting for new events…</p>}</div>
        </details>
      </aside>
    </main>
    <AnimatePresence>{raw && <RawView key="raw" events={events} rawLog={world.rawLog} onClose={() => setRaw(false)} />}</AnimatePresence>
    <AnimatePresence>{world.report && showReport && <ReportScreen key="report" report={world.report} url={siteUrl} onClose={() => setReportMode('closed')} onReset={() => send({ type: 'reset' })} resetBusy={busy({ type: 'reset' })} />}</AnimatePresence>
  </div></MotionConfig>;
}
