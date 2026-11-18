import { Panel } from '../../components/ui';
import { cx } from '../../lib';

/**
 * The bar of views under the header: the map, and the pages that cover it (Plan, Activity, the Logbook). The one on
 * screen is marked; none while Settings or All projects covers them. Phones use their tab bar instead.
 */
export function ViewBar<V extends string>(props: {
  tabs: { id: V; label: string }[];
  /** The view on screen; none while Settings or All projects covers it. */
  value?: V;
  onChange: (view: V) => void;
}) {
  return (
    <Panel as="nav" className="view-bar" aria-label="Views">
      {props.tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={cx('view-bar-tab', props.value === t.id && 'on')}
          aria-current={props.value === t.id ? 'page' : undefined}
          onClick={() => props.onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </Panel>
  );
}
