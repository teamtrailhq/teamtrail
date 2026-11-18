import { useMemo } from 'react';
import { parseInline } from '../../lib/markdown';
import { MdNodes } from './MdNodes';

/** One line of agent-written text with its inline markdown shown (`code`, **bold**, links): a criterion, a title. */
export function MdText({ text, className }: { text: string; className?: string }) {
  const nodes = useMemo(() => parseInline(text), [text]);
  return (
    <span className={className}>
      <MdNodes nodes={nodes} />
    </span>
  );
}
