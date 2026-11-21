import { NODE_W } from '@teamtrail/core';
import { CARD_TEXT_X, DONE_H, DONE_Y } from './cardLayout';
import { wrap } from './wrap';

/** About how many characters fit on a done card's one line, right of its tick. */
const DONE_CHARS = 31;

/**
 * A finished ticket, quiet: one line on a recessed fill, centred where the full card would be. A green tick when its
 * proof is verified, a grey one when it closed on someone's word; then its key and its title.
 */
export function DoneCard(props: { keyText: string; title: string; verified?: boolean }) {
  const cy = DONE_Y + DONE_H / 2;
  const [line] = wrap(props.title, Math.max(8, DONE_CHARS - props.keyText.length - 1), 1);
  return (
    <>
      <rect className="ring" x={-3.5} y={DONE_Y - 3.5} width={NODE_W + 7} height={DONE_H + 7} />
      <rect className="card" x={0.5} y={DONE_Y + 0.5} width={NODE_W - 1} height={DONE_H - 1} />
      <path className={`done-tick${props.verified ? ' verified' : ''}`} d={`M${CARD_TEXT_X} ${cy}l2.5 2.5 4.5 -5`} />
      <text className="title done-title" x={CARD_TEXT_X + 14} y={cy + 4}>
        <tspan className="done-key">{props.keyText}</tspan> {line}
      </text>
    </>
  );
}
