import { cx } from '../../lib';
import { CARD_LABEL_Y, CARD_TEXT_X } from './cardLayout';
import { type CardLabelPart, LABEL_SEP, labelWidth } from './fitLabel';

/**
 * A card's label line, in the scenes' mono caps: TYPE · #n · its state, each part in its tone. An agent at work ends
 * it with the blaze block cursor (still under reduced motion).
 */
export function CardLabel(props: { parts: CardLabelPart[]; cursor?: boolean }) {
  const { parts } = props;
  const end = CARD_TEXT_X + labelWidth(parts) + 3;
  return (
    <>
      <text className="card-label" x={CARD_TEXT_X} y={CARD_LABEL_Y}>
        {parts.map((p, i) => (
          <tspan key={i} className={cx(`lt-${p.tone}`, p.guide && 'guide', p.guide?.off && 'off')}>
            {i > 0 && <tspan className="lt-sep">{LABEL_SEP}</tspan>}
            <tspan data-guide-id={p.guide?.id}>
              {p.guide && <title>{p.guide.tip}</title>}
              {p.text}
            </tspan>
          </tspan>
        ))}
      </text>
      {props.cursor && <rect className="card-cursor" x={end} y={CARD_LABEL_Y - 7.5} width={5} height={9} />}
    </>
  );
}
