import { cx } from '../../lib';
import type { SignGuide } from './types';

/**
 * A ticket's guide in its map card's meta line (`#8 · Task · QA · ready`): `text` is the name as it fits the card,
 * with the full name and version on hover. Quietly marked when agents can't use it now.
 */
export function GuideSignPart(props: { guide?: SignGuide; text?: string }) {
  const g = props.guide;
  if (!g) return null;
  return (
    <tspan className={cx('guide', g.off && 'off')} data-guide-id={g.id}>
      <title>{g.tip}</title> · {props.text ?? g.name}
    </tspan>
  );
}
