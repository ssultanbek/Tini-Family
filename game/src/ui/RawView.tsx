import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { EngineEvent } from '../../../shared/events.ts';
import { splitRawLine } from './rawLine.ts';

const channels = ['hook', 'config', 'sdk', 'scan'] as const;

/** Pretty JSON with token spans. Text nodes only, so React escapes everything. */
export function highlightJson(value: unknown): ReactNode[] {
  const json = JSON.stringify(value, null, 2);
  const parts: ReactNode[] = [];
  const token = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  for (let match = token.exec(json); match; match = token.exec(json)) {
    if (match.index > last) parts.push(json.slice(last, match.index));
    const [text, string, colon, literal] = match;
    const kind = string ? colon ? 'key' : 'string' : literal ? 'literal' : 'number';
    parts.push(<span key={match.index} className={`json-${kind}`}>{string ?? text}</span>);
    if (colon) parts.push(colon);
    last = match.index + text.length;
  }
  parts.push(json.slice(last));
  return parts;
}

export function RawView({ events, rawLog, onClose }: { events: EngineEvent[]; rawLog: string[]; onClose: () => void }) {
  const [tab, setTab] = useState<'log' | 'events'>('log');
  const [hidden, setHidden] = useState<string[]>([]);
  const body = useRef<HTMLDivElement>(null);
  const lines = rawLog.map(splitRawLine);
  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight; }, [tab, rawLog.length, events.length]);
  return <motion.aside className="raw-view" aria-label="Raw engine view" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
    <header className="raw-head">
      <strong>{'{ }'} RAW VIEW</strong>
      <div className="raw-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'log'} onClick={() => setTab('log')}>Engine log · {rawLog.length}</button>
        <button role="tab" aria-selected={tab === 'events'} onClick={() => setTab('events')}>Event JSON · {events.length}</button>
      </div>
      <button className="raw-close" aria-label="Close raw view" onClick={onClose}>×</button>
    </header>
    {tab === 'log' && <div className="raw-filters">{channels.map(channel => <label key={channel} className={`raw-chip ch-${channel}`}><input type="checkbox" checked={!hidden.includes(channel)} onChange={e => setHidden(current => e.target.checked ? current.filter(c => c !== channel) : [...current, channel])} />{channel}</label>)}</div>}
    <div className="raw-body" ref={body} role="log">
      {tab === 'log' ? lines.length ? lines.filter(line => !hidden.includes(line.channel)).map((line, i) => <div key={i} className="raw-line"><span className={`raw-channel ch-${line.channel}`}>{line.channel.padEnd(6)}</span><span>{line.text}</span></div>) : <p className="raw-empty">No raw lines received yet.</p>
        : events.length ? events.map((event, i) => <div key={`${event.seq}-${i}`} className="raw-event"><div className="raw-event-head"><span className="raw-seq">#{event.seq}</span><span className={`raw-actor actor-${event.actor}`}>{event.actor}</span><span className="raw-type">{event.type}</span></div><pre>{highlightJson(event)}</pre></div>) : <p className="raw-empty">No events since connecting. A refresh restores state from the snapshot, not the event history.</p>}
    </div>
  </motion.aside>;
}
