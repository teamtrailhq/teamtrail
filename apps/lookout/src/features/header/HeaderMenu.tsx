import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { cx } from '../../lib';

/**
 * A header button that opens a small menu. Closes on an outside click, on Escape, and after choosing an item.
 * `role` is "dialog" for a panel that says something and offers actions rather than a list of items.
 */
export function HeaderMenu(props: {
  label: ReactNode;
  badge?: ReactNode;
  className?: string;
  tip?: string;
  role?: 'menu' | 'dialog';
  children: (close: () => void) => ReactNode;
}) {
  const role = props.role ?? 'menu';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      const dismissed = e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node);
      if (dismissed) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className={cx('header-menu', props.className)} ref={ref}>
      <Button
        variant="ghost"
        aria-haspopup={role}
        aria-expanded={open}
        on={open}
        data-tip={open ? undefined : props.tip}
        onClick={() => setOpen(!open)}
      >
        {props.label} {props.badge} <span className="caret">▾</span>
      </Button>
      {open && (
        <div className="header-menu-list" role={role}>
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
