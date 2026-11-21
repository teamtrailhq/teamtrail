import {
  addedGuides,
  attention,
  type DiffMark,
  type LaidOutNode,
  type ModelTier,
  NODE_H,
  NODE_W,
} from '@teamtrail/core';
import type { MouseEvent } from 'react';
import type { Selection } from '../../lib';
import type { LiveTicket } from '../../lib/liveTickets';
import { useSignGuide } from '../guides';
import { briefWait } from './briefWait';
import { CardLabel } from './CardLabel';
import { CARD_LINE_H, CARD_TEXT_X, CARD_TITLE_Y } from './cardLayout';
import { cardState } from './cardState';
import { DoneCard } from './DoneCard';
import { modelWait } from './modelWait';
import { nodeClasses } from './nodeClasses';
import { NodeTip } from './NodeTip';
import { nodeTone } from './nodeTone';
import { RerouteMarks } from './RerouteMarks';
import { StepBar } from './StepBar';
import { wrap } from './wrap';

/** About how many title characters fit on one line of a card. */
const TITLE_CHARS = 29;

/**
 * One ticket on the graph, drawn as a scene card: a mono label line (TYPE · #n · its state: the agent's model, asks
 * you, ready 12m, waits on #6), the title (two lines at most) and, while an agent works on it, a thin step track
 * along its foot, with the blaze cursor ending the label line. A finished ticket goes quiet as one line (DoneCard).
 * Rose only for what needs you now; nothing moves at rest but the cursor, and nothing under reduced motion.
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
  pr,
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
  /** Its pull request, as its chip says it (`PR #12 merged`). */
  pr?: string;
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
    ...{ n, live, now, marked, waiting, stalled, brief, wait, verified, needsYou, reserve, pr },
    guide,
  });
  const urgent = waiting || live?.tone === 'needs';
  const heldUp = [urgent, stalled, brief, wait, needsYou && n.state === 'frontier'].some(Boolean);
  const tone = nodeTone({ state: n.state, live: !!s, attention: heldUp });
  const pickUp = live?.tone === 'waiting-agent' && !marked && !frozen;
  const classes = nodeClasses({ n, tone, hitl, selected, live: !!s, waiting: urgent, stalled, mark, frozen, pickUp });
  const select = (e: MouseEvent) => {
    e.stopPropagation();
    onSelect({ kind: 'ticket', id: t.id });
  };
  const place = { transform: `translate(${n.x}px, ${n.y}px)` };
  if (n.state === 'decided' && !marked) {
    return (
      <g className={`${classes} compact`} style={place} data-ticket={t.key} onClick={select}>
        <NodeTip wait={wait} session={s} />
        <DoneCard keyText={t.key} title={t.title} verified={verified} />
        {flag && <circle className={`pr-flag-dot ${flag}`} cx={NODE_W - 2} cy={16} r={4} />}
      </g>
    );
  }
  return (
    <g className={classes} style={place} data-ticket={t.key} onClick={select}>
      <NodeTip wait={wait} session={s} />
      <rect className="ring" x={-3.5} y={-3.5} width={NODE_W + 7} height={NODE_H + 7} />
      <rect className="card" x={0.5} y={0.5} width={NODE_W - 1} height={NODE_H - 1} />
      <CardLabel parts={card.parts} cursor={!!s && !waiting} />
      {lines.map((l, i) => (
        <text key={i} className="title" x={CARD_TEXT_X} y={CARD_TITLE_Y + i * CARD_LINE_H}>
          {l}
        </text>
      ))}
      {s && <StepBar step={s.step} total={s.total} />}
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
