import { cx } from '../../lib';

/**
 * A calm loading state: a small spinner and a quiet line ("Loading your repos…"), and, with `rows`, that many
 * skeleton rows in place of a list that hasn't arrived. Announced politely to screen readers.
 */
export function Loading(props: { label: string; rows?: number; className?: string }) {
  const rows = Array.from({ length: props.rows ?? 0 }, (_, i) => i);
  return (
    <div className={cx('ds-loading', props.className)} role="status" aria-live="polite">
      <span className="ds-loading-line t-meta">
        <span className="ds-spinner" aria-hidden="true" />
        {props.label}
      </span>
      {rows.length > 0 && (
        <ul className="ds-skeleton-list" aria-hidden="true">
          {rows.map((i) => (
            <li key={i} className="ds-skeleton-row">
              <span className="ds-skeleton-bar title" />
              <span className="ds-skeleton-bar meta" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
