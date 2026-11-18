import { useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../../lib';
import { Markdown } from './Markdown';

/**
 * Running text cut to a few lines, with "Read more" only when there is more to read. `markdown` shows it as
 * markdown (an agent's ticket body or comment), cut by height, since its lists and code blocks aren't one paragraph.
 */
export function Clamp({ text, className, markdown }: { text: string; className?: string; markdown?: boolean }) {
  const ref = useRef<HTMLDivElement & HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setCut(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  const shut = !open && 'cut';
  return (
    <div className="clamp">
      {markdown ? (
        <Markdown ref={ref} text={text} className={cx('clamp-md', shut, cut && shut && 'faded', className)} />
      ) : (
        <p ref={ref} className={cx('t-body clamp-text', shut, className)}>
          {text}
        </p>
      )}
      {(cut || open) && (
        <button type="button" className="d-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
