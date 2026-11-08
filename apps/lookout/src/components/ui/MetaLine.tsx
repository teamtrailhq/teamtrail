import type { ReactNode } from 'react';
import { cx } from '../../lib';

/** One part of a meta line: plain text, or text marked as code (mono), emphasised, or urgent (red); `tip` on hover. */
export type MetaPart =
  string | { text: string; code?: boolean; strong?: boolean; urgent?: boolean; className?: string; tip?: string };

type Shown = Exclude<MetaPart, string>;

const toPart = (p: MetaPart): Shown => (typeof p === 'string' ? { text: p } : p);
const partClass = (p: Shown) => cx(p.code && 't-code', p.strong && 'strong', p.urgent && 'urgent', p.className);

/**
 * The quiet context line under a title: parts joined with " · " in the meta role, empty parts skipped.
 * Sentence case, one line; `children` render after the parts (a trailing control or note).
 */
export function MetaLine(props: {
  parts: (MetaPart | false | null | undefined | '')[];
  className?: string;
  children?: ReactNode;
}) {
  const shown = props.parts.filter((p): p is MetaPart => !!p && (typeof p === 'string' || !!p.text)).map(toPart);
  if (!shown.length && !props.children) return null;
  return (
    <span className={cx('meta-line t-meta', props.className)}>
      {shown.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="sep"> · </span>}
          <span className={partClass(p) || undefined} title={p.tip}>
            {p.text}
          </span>
        </span>
      ))}
      {props.children}
    </span>
  );
}
