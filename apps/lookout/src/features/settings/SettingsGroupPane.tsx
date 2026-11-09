import { useEffect, useRef } from 'react';
import { SettingsGroupBody } from './SettingsGroupBody';
import type { SettingsData, SettingsGroup, SettingsRoute } from './types';

/**
 * One Settings group: its heading and intro line over its sections. Focus moves to the heading when the group
 * changes; a deep link to a section scrolls there instead of to the top.
 */
export function SettingsGroupPane(props: { group: SettingsGroup; data: SettingsData; route: SettingsRoute }) {
  const { group, route } = props;
  const heading = useRef<HTMLHeadingElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const target = route.section && document.getElementById(`settings-${route.section}`);
    if (target) target.scrollIntoView({ block: 'start' });
    else pane.current?.scrollTo({ top: 0 });
  }, [group.id, route.section]);
  return (
    <div className="sp-pane" ref={pane}>
      <div className="sp-pane-in">
        <header className="sp-pane-head">
          <h2 className="sp-title t-title" ref={heading} tabIndex={-1}>
            {group.label}
          </h2>
          <p className="sp-intro t-meta">{group.intro}</p>
        </header>
        <SettingsGroupBody group={group.id} data={props.data} route={route} />
      </div>
    </div>
  );
}
