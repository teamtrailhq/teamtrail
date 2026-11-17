import {
  addedGuides,
  attention,
  type DiffMark,
  type LaidOutNode,
  type ModelTier,
  NODE_H,
  NODE_W,
} from '@teamtrail/core';
import type { Selection } from '../../lib';
import type { LiveTicket } from '../../lib/liveTickets';
import { useSignGuide } from '../guides';
import { briefWait } from './briefWait';
import { CardChips } from './CardChips';
import { CARD_TEXT_X } from './cardLayout';
import { cardState } from './cardState';
import { modelWait } from './modelWait';
import { nodeClasses } from './nodeClasses';
import { NodeTip } from './NodeTip';
import { nodeTone } from './nodeTone';
import { RerouteMarks } from './RerouteMarks';
import { StatusDot } from './StatusDot';
import { StepBar } from './StepBar';
import { wrap } from './wrap';

/** About how many title characters fit on one line of a card, right of the status dot. */
const TITLE_CHARS = 26;

/**
 * One ticket on the graph, drawn as a flat card in the three levels of the presenting-data rules: a status dot and
 * the title (what it is, two lines at most), then one quiet row of label chips (key, type, guide, who or state). It
 * moves while something is live: an agent at work pulses and fills a step bar along the top, a ticket waiting for an
 * agent turns its dashed border, and one that needs you breathes its red halo (none of it under reduced motion).
 */
export function GraphNode({
  n,
  live,
  now,
  stalled,
  flag,
  selected,
  onSelect,
  mark,
  frozen,
  needs,
  verified,
  briefHeld,
}: {
  n: LaidOutNode;
  /** Where the ticket is right now (lib/liveTickets.ts): its session, the queue's items on it, what it waits on. */
  live?: LiveTicket;
  now: number;
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
  /** Done: whether its proof is verified (undefined while not known). */
  verified?: boolean;
  /** The discovery gate holds it until the trail lead accepts the brief. */
  briefHeld?: boolean;
}) {
  const t = n.ticket;
  const s = live?.session;
  const lines = wrap(t.title, TITLE_CHARS);
  const hitl = attention(t) === 'hitl';
  const waiting = !!s?.waitingOn;
  const marked = !!mark && mark !== 'unchanged';
  const wait = modelWait(n, needs, !!s);
  const brief = briefWait(n, briefHeld, !!s);
  // the type's guides go without saying: a card names a guide only when one was added to this ticket
  const guide = useSignGuide(addedGuides(t).find((id) => !t.guidesRemoved?.includes(id)));
  const needsYou = hitl && !marked && (t.type === 'task' || t.type === 'execute');
  const reserve = reserveFor(mark, frozen);
  const card = cardState({
    ...{ n, live, now, marked, waiting, stalled, brief, wait, verified, needsYou, reserve },
    guide: guide?.name,
  });
  const urgent = waiting || live?.tone === 'needs';
  const heldUp = [urgent, stalled, brief, wait, needsYou && n.state === 'frontier'].some(Boolean);
  const tone = nodeTone({ state: n.state, live: !!s, attention: heldUp });
  const pickUp = live?.tone === 'waiting-agent' && !marked && !frozen;
  const top = lines.length > 1 ? 19 : 24;
  return (
    <g
      className={nodeClasses({ n, tone, hitl, selected, live: !!s, waiting: urgent, stalled, mark, frozen, pickUp })}
      style={{ transform: `translate(${n.x}px, ${n.y}px)` }}
      data-ticket={t.key}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ kind: 'ticket', id: t.id });
      }}
    >
      <NodeTip wait={wait} session={s} />
      <rect className="ring" x={-3.5} y={-3.5} width={NODE_W + 7} height={NODE_H + 7} rx={9} />
      <rect className="card" x={0.5} y={0.5} width={NODE_W - 1} height={NODE_H - 1} rx={6} />
      {s && <StepBar step={s.step} total={s.total} />}
      <StatusDot tone={tone} cy={top - 4} verified={verified} spin={pickUp} pulse={!!s && !waiting} />
      {lines.map((l, i) => (
        <text key={i} className="title" x={CARD_TEXT_X} y={top + i * 14}>
          {l}
        </text>
      ))}
      <CardChips chips={card.chips} y={top + lines.length * 14 - 8} tone={card.tone} guide={guide} />
      {flag && <circle className={`pr-flag-dot ${flag}`} cx={NODE_W - 2} cy={2} r={4} />}
      <RerouteMarks mark={mark} frozen={frozen} />
    </g>
  );
}

/** Room on the right of the chip row for a reroute tag, and for the ❄ of a frozen ticket. */
function reserveFor(mark?: DiffMark, frozen?: boolean) {
  const tag = mark && mark !== 'unchanged' && mark !== 'cancelled' ? 44 : 0;
  return tag + (frozen ? 12 : 0);
}
