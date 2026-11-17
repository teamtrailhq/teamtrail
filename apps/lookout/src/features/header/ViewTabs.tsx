import { cx } from '../../lib';

/**
 * The views in the header: the map, and the pages that cover it (Plan, Activity, the Logbook). The one on screen is
 * underlined.
 */
export function ViewTabs<V extends string>(props: {
  tabs: { id: V; label: string }[];
  /** The view on screen; none while Settings or All projects covers it. */
  value?: V;
  onChange: (view: V) => void;
}) {
  return (
    <nav className="view-tabs" aria-label="Views">
      {props.tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={cx('view-tab', props.value === t.id && 'on')}
          aria-current={props.value === t.id ? 'page' : undefined}
          onClick={() => props.onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
