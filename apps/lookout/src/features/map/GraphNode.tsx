import {
  attention,
  type DiffMark,
  type LaidOutNode,
  type ModelTier,
  NODE_H,
  NODE_W,
  type SessionInfo,
} from '@teamtrail/core';
import { type Selection, TYPE_TEXT } from '../../lib';
import { GuideSignPart, useSignGuide } from '../guides';
import { CARD_TEXT_X } from './cardLayout';
import { fitCardMeta } from './fitCardMeta';
import { modelWait } from './modelWait';
import { nodeClasses } from './nodeClasses';
import { NodeTip } from './NodeTip';
import { nodeTone } from './nodeTone';
import { RerouteMarks } from './RerouteMarks';
import { statePart } from './statePart';
import { StatusDot } from './StatusDot';
import { wrap } from './wrap';

/** About how many title characters fit on one line of a card, right of the status dot. */
const TITLE_CHARS = 26;

/**
 * One ticket on the graph, drawn as a flat card in the three levels of the presenting-data rules: a status dot and
 * the title (what it is, two lines at most), then one quiet line (key · type · guide · who or state). The agent on
 * it sits in that line too, with its step when no guide takes the room; the step's name is in the tooltip.
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
  const lines = wrap(t.title, TITLE_CHARS);
  const hitl = attention(t) === 'hitl';
  const waiting = !!s?.waitingOn;
  const marked = !!mark && mark !== 'unchanged';
  const wait = modelWait(n, needs, !!s);
  const guide = useSignGuide(t.guide);
  const state = marked ? undefined : statePart({ n, session: s, waiting, stalled, wait, step: !guide });
  const needsYou = hitl && !marked && (t.type === 'task' || t.type === 'execute');
  const heldUp = waiting || !!stalled || !!wait || (needsYou && n.state === 'frontier');
  const tone = nodeTone({ state: n.state, live: !!s, attention: heldUp });
  const type = TYPE_TEXT[t.type];
  const meta = fitCardMeta({ parts: [t.key, type, state?.text, needsYou && 'needs you'], guide: guide?.name });
  const top = lines.length > 1 ? 19 : 24;
  return (
    <g
      className={nodeClasses({ n, tone, hitl, selected, live: !!s, waiting, stalled, mark, frozen })}
      style={{ transform: `translate(${n.x}px, ${n.y}px)` }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: 'ticket', id: t.id });
      }}
    >
      <NodeTip wait={wait} session={s} />
      <rect className="ring" x={-3.5} y={-3.5} width={NODE_W + 7} height={NODE_H + 7} rx={9} />
      <rect className="card" x={0.5} y={0.5} width={NODE_W - 1} height={NODE_H - 1} rx={6} />
      <StatusDot tone={tone} cy={top - 4} />
      {lines.map((l, i) => (
        <text key={i} className="title" x={CARD_TEXT_X} y={top + i * 14}>
          {l}
        </text>
      ))}
      <text className="meta" x={CARD_TEXT_X} y={top + lines.length * 14 + 2} {...meta.squeeze}>
        <tspan className="key">{t.key}</tspan>
        <tspan> · {type}</tspan>
        <GuideSignPart guide={guide} text={meta.guideText} />
        {state && <tspan className={state.tone}> · {state.text}</tspan>}
        {needsYou && <tspan> · needs you</tspan>}
      </text>
      {flag && <circle className={`pr-flag-dot ${flag}`} cx={NODE_W - 2} cy={2} r={4} />}
      <RerouteMarks mark={mark} frozen={frozen} />
    </g>
  );
}
