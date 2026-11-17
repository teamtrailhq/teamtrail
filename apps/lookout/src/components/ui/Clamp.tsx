import { useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../../lib';

/** Running text cut to a few lines, with "Read more" only when there is more to read. */
export function Clamp({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setCut(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <div className="clamp">
      <p ref={ref} className={cx('t-body clamp-text', !open && 'cut', className)}>
        {text}
      </p>
      {(cut || open) && (
        <button type="button" className="d-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
