import { cx } from '../../lib';
import type { SignGuide } from '../guides/types';
import { CARD_TEXT_X } from './cardLayout';
import type { CardChip } from './layoutChips';

/** Chip height, and its text's baseline inside it. */
const H = 13;
const BASELINE = 9.5;

/**
 * A card's meta row as label chips under the title. The state chips carry the state's tone (an agent at work, held
 * up, needs you now); the guide's chip has its full name and version on hover, and is marked when agents can't use
 * it now.
 */
export function CardChips(props: { chips: CardChip[]; y: number; tone?: string; guide?: SignGuide }) {
  const g = props.guide;
  return (
    <g className="meta" transform={`translate(${CARD_TEXT_X} ${props.y})`}>
      {props.chips.map((c, i) => {
        const guide = c.kind === 'guide' ? g : undefined;
        return (
          <g
            key={i}
            className={cx('card-chip', c.kind, c.kind === 'state' && props.tone, guide?.off && 'off')}
            data-guide-id={guide?.id}
            transform={`translate(${c.x} 0)`}
          >
            {guide && <title>{guide.tip}</title>}
            <rect width={c.w} height={H} rx={3} />
            <text x={(c.w - c.textW) / 2} y={BASELINE} textLength={c.textW} lengthAdjust="spacingAndGlyphs">
              {c.text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
