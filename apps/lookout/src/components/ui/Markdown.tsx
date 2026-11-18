import { forwardRef, useMemo } from 'react';
import { cx } from '../../lib';
import { parseMarkdown } from '../../lib/markdown';
import { MdBlocks } from './MdBlocks';

/**
 * Agent-written markdown (a ticket's body, a comment), shown as text people read: paragraphs, lists, bold and
 * italic, code, quotes and links. It is untrusted: no HTML is ever rendered, links go only to http(s) URLs
 * (`webUrl`) and open in a new tab, and images show as their alt text, so nothing loads from the network.
 */
export const Markdown = forwardRef<HTMLDivElement, { text: string; className?: string }>(function Markdown(props, ref) {
  const blocks = useMemo(() => parseMarkdown(props.text), [props.text]);
  return (
    <div ref={ref} className={cx('md t-body', props.className)}>
      <MdBlocks blocks={blocks} />
    </div>
  );
});
