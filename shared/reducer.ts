// Folds events into WorldState. The engine uses it to build the reconnect
// snapshot; the game may use it for its store. It records facts, it never decides.
import type { EngineEvent, Segment, WorldState } from "./events.ts";

export function initialState(): WorldState {
  return {
    seq: 0, phase: "idle", prompt: null, turns: [], segments: [], contract: null, dog: "sleeping", bricks: 0,
    blocked: [], openEscalation: null, findings: [], launchUnlocked: false, report: null, rawLog: [],
  };
}

const setSeg = (segs: Segment[], id: string, patch: Partial<Segment>) =>
  segs.map((s) => (s.id === id ? { ...s, ...patch } : s));

export function reduce(s: WorldState, e: EngineEvent): WorldState {
  const n: WorldState = { ...s, seq: e.seq };
  switch (e.type) {
    case "session.reset": return { ...initialState(), seq: e.seq };
    case "session.phase": n.phase = e.phase; break;
    case "user.prompt": n.prompt = e.text; break;
    case "turn.started": n.turns = [...s.turns, { id: e.turnId, prompt: e.prompt }]; n.prompt = e.prompt; break;
    case "turn.finished": n.turns = s.turns.map((t) => (t.id === e.turnId ? { ...t, summary: e.summary } : t)); break;
    case "launch.locked": n.launchUnlocked = false; break;
    case "fence.plan.proposed": n.segments = e.segments; n.contract = e.contract; break;
    case "fence.plan.approved": n.contract = null; break;
    case "fence.segment.built":
      n.segments = s.segments.some((x) => x.id === e.segment.id)
        ? setSeg(s.segments, e.segment.id, { ...e.segment, status: "built" })
        : [...s.segments, { ...e.segment, status: "built" }];
      break;
    case "dog.state": n.dog = e.state; break;
    case "dog.brick.placed": n.bricks = e.bricks; break;
    case "fence.blocked": n.blocked = [...s.blocked, e]; break;
    case "escalation.opened": n.openEscalation = e; break;
    case "escalation.resolved": n.openEscalation = null; break;
    case "tina.inspect.segment": n.segments = setSeg(s.segments, e.segmentId, { status: "inspecting" }); break;
    case "segment.red":
      n.segments = setSeg(s.segments, e.segmentId, { status: "red" });
      n.findings = [...s.findings.filter((f) => f.id !== e.finding.id), e.finding];
      break;
    case "fix.applied": n.findings = s.findings.filter((f) => f.id !== e.findingId); break;
    case "segment.green": n.segments = setSeg(s.segments, e.segmentId, { status: "green" }); break;
    case "launch.unlocked": n.launchUnlocked = true; break;
    case "report.ready": n.report = e.report; break;
    case "raw.log": n.rawLog = [...s.rawLog, `[${e.channel}] ${e.text}`].slice(-200); break;
  }
  return n;
}
