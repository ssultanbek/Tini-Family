import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { EngineEvent, GameCommand, SegmentStatus } from '../../../shared/events.ts';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { commandKey, store } from '../store.ts';
import { fixedAwaitingGreen } from './fixedFindings.ts';
import { ReportScreen } from './Report.tsx';
import { RawView } from './RawView.tsx';
import { PromptBar, TurnHistory } from './Project.tsx';
import { reportVisible, type ReportMode } from './promptMode.ts';
import { gameLayout } from '../layout.ts';
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
    case 'engine.error': return event.message;
    case 'launch.done': return event.url ?? 'Launch complete';
    default: return '';
  }
}

/** The game view at `/`. Split from Dashboard.tsx so the yard can be redesigned while the dashboard fallback stays frozen. */
export function GameView({ send }: { send: (command: GameCommand) => boolean }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { world, events, speech, pending, connected, synced } = state;
  const [adjustment, setAdjustment] = useState('');
  const [adjustSent, setAdjustSent] = useState(false);
  const [raw, setRaw] = useState(false);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [reportMode, setReportMode] = useState<ReportMode>('auto');
  const log = useRef<HTMLDivElement>(null);
  const available = connected && synced;
  const busy = (command: GameCommand) => !available || pending.includes(commandKey(command));
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [events.length, raw]);
  useEffect(() => { setDismissed([]); setAdjustSent(false); setAdjustment(''); setReportMode('auto'); }, [state.epoch]);
  useEffect(() => { setReportMode('auto'); }, [world.turns.length]);
  const escalation = world.openEscalation;
  const fixed = fixedAwaitingGreen(world, events);
  const siteUrl = events.reduce<string | undefined>((url, event) => event.type === 'launch.done' ? event.url : url, undefined);
  const lockReason = events.reduce<string | undefined>((reason, event) => event.type === 'launch.locked' ? event.reason : event.type === 'launch.unlocked' ? undefined : reason, undefined);
  const showReport = reportVisible(reportMode, world.phase, !!world.report);
  // The bar leads the controls column so it never covers a card.
  const promptBar = <PromptBar world={world} send={send} available={available} pending={pending} epoch={state.epoch} />;
  const launch: GameCommand = { type: 'launch' };

  return <MotionConfig reducedMotion="user"><div className="app game-app" style={gameLayout as CSSProperties}>
    <header className="topbar titlebar"><div className="brand"><span className="brand-mark" aria-hidden="true">▦</span><div><h1>Tini Family</h1><p className="tagline">Your agent gets the keys to the room, not the house.</p></div><span className="brand-view">The yard · ShellHacks 2026</span></div>
      <div className="header-actions"><button className={`raw-toggle ${raw ? 'on' : ''}`} aria-pressed={raw} onClick={() => setRaw(on => !on)}>{'{ }'} Raw view</button><a href="/?view=dashboard">Dashboard</a><span role="status" className={`badge ${connected ? 'online' : 'offline'}`}>{connected ? synced ? '● Connected' : '● Connected · syncing' : '○ Disconnected'}</span><button className="secondary" disabled={busy({ type: 'reset' })} onClick={() => send({ type: 'reset' })}>{pending.includes('reset') ? 'Reset sent…' : 'Reset'}</button></div>
    </header>
    {!available && <p className="notice" role="status">{state.connectionError || (connected ? 'Waiting for the engine snapshot…' : 'Waiting for the engine at localhost:4000…')}</p>}
    {state.engineError && <p className="error" role="alert">Engine error: {state.engineError}</p>}
    <div className="stats"><div><span>Current phase</span><strong>{world.phase}</strong></div><div><span>Dog state</span><strong>{world.dog}</strong></div><div><span>Bricks placed</span><strong>{world.bricks}</strong></div><div><span>Fence segments</span><strong>{world.segments.length}</strong></div></div>
    <main className="yard-shell"><Yard /><div className="columns"><div className="stack">{promptBar}
      <AnimatePresence initial={false}>
      {world.contract && <MotionCard key="contract" title={world.contract.title} className="action-card"><h3>Allowed inside</h3><Lines items={world.contract.allowed} /><h3>Removed before access</h3><Lines items={world.contract.stripped} /><p>{world.contract.outside}</p><button disabled={busy({ type: 'approve.plan' })} onClick={() => send({ type: 'approve.plan' })}>{pending.includes('approve.plan') ? 'Approval sent…' : 'Approve'}</button><form className="adjust" onSubmit={e => { e.preventDefault(); if (send({ type: 'adjust.plan', text: adjustment.trim() })) setAdjustSent(true); }}><label htmlFor="adjustment">Request an adjustment</label><textarea id="adjustment" value={adjustment} onChange={e => { setAdjustment(e.target.value); setAdjustSent(false); }} /><button className="secondary" disabled={!available || !adjustment.trim() || adjustSent}>Adjust</button>{adjustSent && <p role="status">Adjustment sent. Waiting for the engine; the mock does not change the plan.</p>}</form></MotionCard>}
      {escalation && <MotionCard key={escalation.escalationId} title={escalation.source === 'prompt' ? 'Your request needs something outside the fence' : 'Claude is asking for more'} className="action-card"><p>{escalation.ask}</p><p className="path">{escalation.requested}</p><h3>Inspection · {escalation.inspection.totalFiles.toLocaleString()} files</h3><ul>{escalation.inspection.highlights.map((item, i) => <li key={i}><strong>{item.count.toLocaleString()}</strong> {item.label} <span className="muted">({item.severity})</span></li>)}</ul><div className="stack">{escalation.options.map(option => <button key={option.id} className={`option ${option.recommended ? 'recommended' : 'secondary'}`} disabled={busy({ type: 'escalation.choose', escalationId: escalation.escalationId, optionId: option.id })} onClick={() => send({ type: 'escalation.choose', escalationId: escalation.escalationId, optionId: option.id })}>{option.recommended && <span className="recommend-label">★ Recommended by the engine</span>}<strong>{option.label}</strong><span>{option.detail}</span></button>)}</div>{pending.includes(`escalation:${escalation.escalationId}`) && <p role="status">Choice sent. Waiting for the engine…</p>}</MotionCard>}
      {world.findings.map(finding => <MotionCard key={finding.id} title={finding.title} className="finding"><p className="badge offline">! {finding.severity} · {finding.segmentId}</p><p>{finding.explanation}</p>{raw && finding.file && <p className="path">{finding.file}</p>}<div className="button-row">{finding.fixes.map(fix => <button key={fix.id} disabled={busy({ type: 'fix.apply', findingId: finding.id, fixId: fix.id })} onClick={() => send({ type: 'fix.apply', findingId: finding.id, fixId: fix.id })}>{fix.label}</button>)}</div>{pending.includes(`fix:${finding.id}`) && <p role="status">Fix requested. Waiting for the engine…</p>}</MotionCard>)}
      {fixed.map(({ finding, summary }) => <MotionCard key={finding.id} title={finding.title} className="finding fixed" lingering><p className="badge online">✓ Fixed · {finding.segmentId}</p><p>{summary}</p><p className="muted">Waiting for Tina to mark the fence green…</p></MotionCard>)}
      </AnimatePresence>
      <Card title="Launch"><p>{world.phase === 'launched' ? 'Launched. The engine’s access report is ready.' : world.launchUnlocked ? 'The engine has unlocked launch.' : 'Waiting for the engine to unlock launch.'}</p>{!world.launchUnlocked && lockReason && <p className="lock-reason" role="status">🔒 {lockReason}</p>}<button disabled={!world.launchUnlocked || world.phase === 'launched' || busy(launch)} onClick={() => send(launch)}>{world.phase === 'launched' ? 'Launched' : pending.includes('launch') ? 'Launch sent…' : 'Launch'}</button>{world.report && !showReport && <button className="secondary report-reopen" onClick={() => setReportMode('open')}>Show access report</button>}</Card>
      <Card title={world.turns.length ? `The project · ${world.turns.length} ${world.turns.length === 1 ? 'turn' : 'turns'}` : 'The project'}><TurnHistory world={world} /></Card>
      {world.report && <Card title="Access report">{(['allowed', 'blocked', 'narrowed', 'fixed'] as const).map(category => <div key={category}><h3 className="capitalize">{category}</h3>{world.report![category].length ? <ul>{world.report![category].map((line, i) => <li key={i}><strong>{line.what}</strong><br />{line.why}</li>)}</ul> : <p>None reported.</p>}</div>)}<h3>Data leaves to</h3><Lines items={world.report.dataLeavesTo} /></Card>}
    </div><details className="yard-details" ><summary>Fence details, crew & event log</summary><div className="stack">
      <Card title="The fence"><div className="legend">{Object.entries(statusLabels).map(([status, label]) => <span key={status} className={`status ${status}`}>{label}</span>)}</div>{world.segments.length ? <div className="segments">{world.segments.map(segment => <article key={segment.id} className={`segment ${segment.status}`}><div className="segment-heading"><h3>{segment.label}</h3><span className={`status ${segment.status}`}>{statusLabels[segment.status]}</span></div><p>{segment.detail}</p></article>)}</div> : <p className="muted">The engine has not proposed a fence yet.</p>}</Card>
      <Card title="From the crew"><div className="stack">{(['tini', 'tina', 'dog'] as const).map(actor => <div key={actor}><strong>{names[actor]}</strong><p className="speech">{speech[actor] ?? 'No speech received since connecting.'}</p></div>)}{speech.system && <p><strong>System:</strong> {speech.system}</p>}</div></Card>
      <Card title={`Event log · ${events.length}`}><label className="toggle"><input type="checkbox" checked={raw} onChange={e => setRaw(e.target.checked)} /> Raw view</label><p className="muted">{state.snapshotSeq !== null ? `Restored snapshot #${state.snapshotSeq}. ` : ''}Events received this connection, oldest first. Auto-scrolls to latest.</p><div className="event-log" ref={log} role="log" aria-label="Engine event log" aria-live="off">{events.map((event, i) => <article key={`${event.seq}-${i}`} className="event"><div className="event-meta">#{event.seq} · {names[event.actor]} · {new Date(event.ts).toLocaleTimeString()}</div><strong>{event.type}</strong><p>{describe(event)}</p>{raw && <pre>{JSON.stringify(event, null, 2)}</pre>}</article>)}{!events.length && <p className="muted">Waiting for new events…</p>}</div>{raw && <><h3>Engine raw log</h3><pre className="raw-log">{world.rawLog.join('\n') || 'No raw lines received.'}</pre></>}</Card>
      <Card title={`Blocked attempts · ${world.blocked.length}`}>{world.blocked.length ? world.blocked.map(block => <article className="blocked-history" key={block.seq}><strong>{block.target}</strong>{block.simulated && <span className="tag">Simulated attack</span>}<p>{block.reason}</p><p className="muted">{block.tool} · {block.layer}</p></article>) : <p className="muted">None reported.</p>}</Card>
    </div></details></div></main>
    <aside className="toasts" aria-label="Blocked attempt notifications" aria-live="polite">{world.blocked.filter(block => !dismissed.includes(block.seq)).slice(-2).map(block => <div className="toast" key={block.seq}><div className="segment-heading"><strong>Access blocked</strong><button className="dismiss" aria-label={`Dismiss notification for ${block.target}`} onClick={() => setDismissed(current => [...current, block.seq])}>×</button></div>{block.simulated && <span className="tag">Simulated attack</span>}<p className="path">{block.target}</p><p>{block.reason}</p></div>)}</aside>
    <AnimatePresence>{raw && <RawView key="raw" events={events} rawLog={world.rawLog} onClose={() => setRaw(false)} />}</AnimatePresence>
    <AnimatePresence>{world.report && showReport && <ReportScreen key="report" report={world.report} url={siteUrl} onClose={() => setReportMode('closed')} onReset={() => send({ type: 'reset' })} resetBusy={busy({ type: 'reset' })} />}</AnimatePresence>
    <footer>Engine: localhost:4000 · Last event #{world.seq} · <a href="/?view=dashboard">Dashboard</a></footer>
  </div></MotionConfig>;
}
