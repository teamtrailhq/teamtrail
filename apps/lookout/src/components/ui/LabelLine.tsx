import type { ElementType, ReactNode } from 'react';
import { cx } from '../../lib';
import { type LabelPart, type LabelTone, labelParts } from '../../lib/labelParts';
import { Cursor } from './Cursor';

/**
 * The scenes' label line: short parts in mono capitals joined with " · " (`QUESTION · #6 · CLAUDE-02 · 4M`), above a
 * title. `tone` colours the whole line, a part's own `tone` just that part: rose only for what needs you now, blaze
 * for an agent and work in progress, green for verified. `cursor` ends it with the blaze block cursor (an agent at
 * work). `children` follow the parts (a trailing note or control). One line; it wraps on a phone rather than cut.
 */
export function LabelLine(props: {
  parts: (LabelPart | false | null | undefined | '')[];
  tone?: LabelTone;
  cursor?: boolean;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}) {
  const { as: Root = 'span', tone = 'plain' } = props;
  const shown = labelParts(props.parts);
  if (!shown.length && !props.cursor && !props.children) return null;
  return (
    <Root className={cx('ds-label', `tone-${tone}`, props.className)}>
      {shown.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="ds-label-sep"> · </span>}
          <span className={cx(p.tone !== 'plain' && `tone-${p.tone}`, p.className) || undefined} title={p.tip}>
            {p.text}
          </span>
        </span>
      ))}
      {props.cursor && <Cursor />}
      {props.children}
    </Root>
  );
}
