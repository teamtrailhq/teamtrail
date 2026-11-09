import {
  attention,
  type DiffMark,
  type LaidOutNode,
  type ModelTier,
  NODE_H,
  NODE_W,
  type SessionInfo,
} from '@teamtrail/core';
import { type Selection, STATE_LABEL } from '../../lib';
import { GuideSignPart, useSignGuide } from '../guides';
import { SIGN_TIP } from './edgePath';
import { fitSignMeta } from './fitSignMeta';
import { modelWait } from './modelWait';
import { ModelWaitTitle } from './ModelWaitTitle';
import { RerouteMarks } from './RerouteMarks';
import { wrap } from './wrap';

/** The sign's arrow: it starts on the board's right edge. */
const SIGN_TIP_PATH = `M${NODE_W} 0L${NODE_W + SIGN_TIP} ${NODE_H / 2}L${NODE_W} ${NODE_H}z`;

/**
 * One ticket on the graph, drawn as a trail sign, in the three levels of the presenting-data rules: a state edge on the left, the title
 * (what it is, two lines at most), and one quiet line (key · type · guide · state). The live session line sits under it.
 */
export function GraphNode({
  n,
  session: s,
  stalled,
  flag,
  selected,
  onSelect,
  mark,
  frozen,
  needs,
}: {
  n: LaidOutNode;
  session?: SessionInfo;
  /** Claimed by an agent whose lease is about to run out or ran out. */
  stalled?: boolean;
  /** Most serious open PR/CI mismatch flag. */
  flag?: 'alert' | 'warn';
  selected: boolean;
  onSelect: (s: Selection) => void;
  /** How a pending reroute would change the ticket (map preview). */
  mark?: DiffMark;
  /** Frozen by a pending reroute: it can't be claimed until the trail lead decides. */
  frozen?: boolean;
  /** Model matching: ready, but waiting for a stronger model than any connected agent runs. */
  needs?: ModelTier;
}) {
  const t = n.ticket;
  const lines = wrap(t.title, 29);
  const hitl = attention(t) === 'hitl';
  const waiting = !!s?.waitingOn;
  const marked = !!mark && mark !== 'unchanged';
  const wait = modelWait(n, needs, !!s);
  const state = marked ? undefined : statePart(n, { waiting, stalled, wait });
  const needsYou = hitl && !marked && (t.type === 'task' || t.type === 'execute');
  const guide = useSignGuide(t.guide);
  const meta = fitSignMeta({ parts: [t.key, t.type, state?.text, needsYou && 'needs you'], guide: guide?.name });
  const flags = { hitl, selected, live: !!s, waiting, stalled, mark, frozen };
  return (
    <g
      className={nodeClasses(n, flags)}
      style={{ transform: `translate(${n.x}px, ${n.y}px)` }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: 'ticket', id: t.id });
      }}
    >
      <ModelWaitTitle wait={wait} />
      {waiting && <rect className="alarm" x={-6} y={-6} width={NODE_W + 12} height={NODE_H + 12} />}
      <rect className="post" x={NODE_W / 2 - 6} y={NODE_H} width={12} height={12} />
      <rect className="tuft" x={NODE_W / 2 - 11} y={NODE_H + 12} width={22} height={3} />
      <path className="body tip" d={SIGN_TIP_PATH} />
      <rect className="body" width={NODE_W} height={NODE_H} />
      <rect width={NODE_W} height={NODE_H} fill="url(#sign-grain)" />
      {(n.state === 'blocked' || n.state === 'parked') && (
        <rect width={NODE_W} height={NODE_H} fill="url(#hatch-dim)" />
      )}
      {n.state === 'out-of-scope' && <rect width={NODE_W} height={NODE_H} fill="url(#hatch-oos)" />}
      <rect className="edge-bar" width={4} height={NODE_H} />
      {lines.map((l, i) => (
        <text key={i} className="title" x={12} y={19 + i * 14}>
          {l}
        </text>
      ))}
      <text className="meta" x={12} y={NODE_H - 8} {...meta.squeeze}>
        <tspan className="key">{t.key}</tspan>
        <tspan> · {t.type}</tspan>
        <GuideSignPart guide={guide} text={meta.guideText} />
        {state && <tspan className={state.tone}> · {state.text}</tspan>}
        {needsYou && <tspan> · needs you</tspan>}
      </text>
      {flag && <circle className={`pr-flag-dot ${flag}`} cx={NODE_W - 2} cy={2} r={4} />}
      <RerouteMarks mark={mark} frozen={frozen} />
      {s && !waiting && (
        <text className="live-tag" x={NODE_W} y={NODE_H + 13} textAnchor="end">
          {s.agent} · step {s.step}/{s.total} · {s.stepLabel.toLowerCase()}
        </text>
      )}
    </g>
  );
}

/** The node's classes: its state, who it's for, and what's going on around it (selection, a session, a reroute). */
function nodeClasses(
  n: LaidOutNode,
  f: {
    hitl: boolean;
    selected: boolean;
    live: boolean;
    waiting: boolean;
    stalled?: boolean;
    mark?: DiffMark;
    frozen?: boolean;
  },
) {
  const classes = ['node', `st-${n.state}`, f.hitl ? 'hitl' : 'afk'];
  if (f.selected) classes.push('sel');
  if (f.live) classes.push('live');
  if (f.waiting) classes.push('waiting');
  if (f.stalled && !f.waiting) classes.push('stalled');
  if (f.mark) classes.push(`mark-${f.mark}`);
  if (f.frozen) classes.push('frozen');
  return classes.join(' ');
}

/**
 * The state part of the meta line: waiting on you beats stalled beats waiting for a stronger model (model matching)
 * beats who holds it beats the plain state.
 */
function statePart(n: LaidOutNode, flags: { waiting: boolean; stalled?: boolean; wait?: ModelTier }) {
  const assignee = n.ticket.assignee;
  if (flags.waiting) return { text: 'waiting on you', tone: 'urgent' };
  if (flags.stalled) return { text: `stalled · ${assignee}`, tone: 'warn' };
  if (flags.wait) return { text: `needs ${flags.wait}`, tone: 'warn' };
  if (n.state === 'claimed') return { text: assignee ?? 'working', tone: 'agent' };
  return { text: STATE_LABEL[n.state], tone: '' };
}
