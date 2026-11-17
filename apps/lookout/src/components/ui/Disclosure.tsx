import { useState, type ReactNode } from 'react';

/** "Details" that open in place: what isn't needed at a glance, one click away. */
export function Disclosure(props: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const label = props.label ?? 'Details';
  return (
    <div className="disclosure">
      <button type="button" className="d-more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? `Hide ${label.toLowerCase()}` : label}
      </button>
      {open && <div className="disclosure-body">{props.children}</div>}
    </div>
  );
}
