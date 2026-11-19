import { useEffect, useRef, useState } from 'react';
import { cx } from '../../lib';

/** One entry of a "⋯" menu: what it does, why on hover, red only when it removes something from the work. */
export interface MenuItem {
  id: string;
  label: string;
  tip?: string;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * The "⋯" button at the end of an action bar and the actions that don't need to be on screen all the time. Closes on
 * a pick, a click outside or Escape. Nothing when there is nothing to offer.
 */
export function MoreMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    // inside a box that scrolls (an open row on a phone), the list opens where it can be seen
    list.current?.scrollIntoView?.({ block: 'nearest' });
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <span className="more-menu" ref={root}>
      <button
        type="button"
        className={cx('btn more-btn', open && 'on')}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⋯
      </button>
      {open && (
        <span className="more-list" role="menu" ref={list}>
          {items.map((i) => (
            <button
              key={i.id}
              type="button"
              role="menuitem"
              className={cx('more-item', i.danger && 'danger')}
              data-tip={i.tip}
              onClick={() => {
                setOpen(false);
                i.onSelect();
              }}
            >
              {i.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
