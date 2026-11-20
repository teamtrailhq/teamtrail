import type { ElementType, ReactNode } from 'react';
import { cx } from '../../lib';
import type { EdgeTone } from './Row';

/**
 * The scenes' card: square corners and a hairline, a head with an optional label line (pass a `LabelLine`), the
 * headline (what this is or decides) and one line of `help`, then its body (rows, a form, a diff) and an optional
 * `foot` (actions on the left, a quiet note pushed right with `.ds-scard-note`). `edge` marks it as list rows do:
 * rose only when it needs you now.
 */
export function SceneCard(props: {
  label?: ReactNode;
  headline?: ReactNode;
  help?: ReactNode;
  foot?: ReactNode;
  edge?: EdgeTone;
  as?: ElementType;
  /** The headline's element, so a card can sit at the right heading level. */
  headlineAs?: ElementType;
  className?: string;
  children?: ReactNode;
}) {
  const { as: Root = 'section', headlineAs: Headline = 'h3', edge = 'neutral' } = props;
  const head = props.label || props.headline || props.help;
  return (
    <Root className={cx('ds-scard', `edge-${edge}`, props.className)}>
      {head && (
        <div className="ds-scard-head">
          {props.label}
          {props.headline && <Headline className="ds-scard-headline">{props.headline}</Headline>}
          {props.help && <p className="ds-scard-help">{props.help}</p>}
        </div>
      )}
      {props.children && <div className="ds-scard-body">{props.children}</div>}
      {props.foot && <div className="ds-scard-foot">{props.foot}</div>}
    </Root>
  );
}
