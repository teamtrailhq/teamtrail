import { MetaLine, Row } from '../../components/ui';
import { SETTINGS_GROUPS } from './settingsGroups';
import type { SettingsGroupId } from './types';

/**
 * The Settings side nav: one row per group with the sections it holds. On a phone it is the whole first screen and
 * each row drills into its group.
 */
export function SettingsNav(props: {
  current?: SettingsGroupId;
  onPick: (group: SettingsGroupId) => void;
  drill?: boolean;
}) {
  return (
    <nav className="sp-nav" aria-label="Settings groups">
      <ul>
        {SETTINGS_GROUPS.map((g) => {
          const on = g.id === props.current;
          return (
            <Row
              key={g.id}
              as="li"
              className="sp-nav-row"
              selected={on}
              current={on ? 'page' : undefined}
              title={g.label}
              context={<MetaLine parts={g.sections.map((s) => s.title)} />}
              trailing={props.drill && '›'}
              onOpen={() => props.onPick(g.id)}
            />
          );
        })}
      </ul>
    </nav>
  );
}
