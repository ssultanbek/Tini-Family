import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { AccessReport, ReportLine } from '../../../shared/events.ts';

const sections: { key: Exclude<keyof AccessReport, 'dataLeavesTo'>; title: string; icon: string; empty: string }[] = [
  { key: 'allowed', title: 'Allowed', icon: '✓', empty: 'Nothing was let inside the fence.' },
  { key: 'blocked', title: 'Blocked', icon: '⛔', empty: 'Nothing tried to get past the fence.' },
  { key: 'narrowed', title: 'Narrowed', icon: '◐', empty: 'No access requests were narrowed.' },
  { key: 'fixed', title: 'Fixed', icon: '🔧', empty: 'Tina found nothing to fix.' },
];
const rise = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } };

function Section({ title, icon, lines, empty, kind }: { title: string; icon: string; lines: ReportLine[]; empty: string; kind: string }) {
  return <motion.section className={`report-section report-${kind}`} variants={rise}>
    <h3><span className="report-icon" aria-hidden="true">{icon}</span>{title}<span className="report-count">{lines.length}</span></h3>
    {lines.length ? <ul>{lines.map((line, i) => <li key={i}><strong>{line.what}</strong><span>{line.why}</span></li>)}</ul> : <p className="muted">{empty}</p>}
  </motion.section>;
}

/** End screen: drawn only from the engine's report.ready payload. */
export function ReportScreen({ report, url, onClose, onReset, resetBusy }: { report: AccessReport; url?: string; onClose: () => void; onReset: () => void; resetBusy: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  // Focus the panel top (not the bottom buttons) so the title is what's on screen.
  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);
  return <motion.div className="report-screen" role="dialog" aria-modal="true" aria-labelledby="report-title"
    onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.div className="report-panel" ref={panel} tabIndex={-1} initial="hidden" animate="show" variants={{ hidden: { scale: .96 }, show: { scale: 1, transition: { staggerChildren: .08 } } }}>
      <motion.header className="report-header" variants={rise}>
        <p className="eyebrow">LAUNCHED · ACCESS REPORT</p>
        <h2 id="report-title">Here’s everything the dog could touch</h2>
        {url && <p className="path">Site running at <a href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>}
      </motion.header>
      <div className="report-grid">{sections.map(section => <Section key={section.key} kind={section.key} title={section.title} icon={section.icon} empty={section.empty} lines={report[section.key]} />)}</div>
      <motion.section className="report-leaves" variants={rise}>
        <h3><span className="report-icon" aria-hidden="true">↗</span>Data leaves to</h3>
        {report.dataLeavesTo.length ? <ul>{report.dataLeavesTo.map(host => <li key={host} className="path">{host}</li>)}</ul> : <p className="muted">No outside servers. Nothing leaves your machine.</p>}
      </motion.section>
      <motion.div className="button-row report-actions" variants={rise}>
        <button className="secondary" onClick={onClose}>Back to the yard</button>
        <button disabled={resetBusy} onClick={onReset}>{resetBusy ? 'Reset sent…' : 'Start over'}</button>
      </motion.div>
    </motion.div>
  </motion.div>;
}
