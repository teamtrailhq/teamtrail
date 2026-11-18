import type { ReactNode } from 'react';
import { cx } from '../../lib';

/**
 * A label chip, as on the map's cards: a quiet flat fill, the text in the meta role. `tone` colours a state
 * (`agent` at work, `warn` held up or at risk, `urgent` needs you now, `verified` proven); `code` sets a key in mono.
 */
export function Tag(props: {
  children: ReactNode;
  tone?: 'agent' | 'warn' | 'urgent' | 'verified';
  code?: boolean;
  className?: string;
  tip?: string;
}) {
  return (
    <span className={cx('tag', props.tone, props.code && 't-code', props.className)} data-tip={props.tip}>
      {props.children}
    </span>
  );
}
