import type { ReactNode } from 'react';
import { cx } from '../../lib';

/**
 * One section of a detail view: a label, an optional "Edit" link beside it, and read-only content. Controls never sit
 * in the content: editing opens from the link, or from the view's action bar.
 */
export function DetailSection(props: {
  label: string;
  className?: string;
  onEdit?: () => void;
  editLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx('d-section', props.className)}>
      <header className="d-section-head">
        <span className="t-label">{props.label}</span>
        {props.onEdit && (
          <button type="button" className="d-edit" onClick={props.onEdit}>
            {props.editLabel ?? 'Edit'}
          </button>
        )}
      </header>
      {props.children}
    </section>
  );
}
