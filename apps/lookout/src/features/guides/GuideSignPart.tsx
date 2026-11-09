import { cx } from '../../lib';
import type { SignGuide } from './types';

/**
 * A ticket's guide in its map sign's meta line (`#8 · task · QA · ready`): `text` is the name as it fits the sign,
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
