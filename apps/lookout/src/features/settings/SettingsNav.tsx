import { Cursor, LabelLine } from '../../components/ui';
import { cx } from '../../lib';
import { SETTINGS_GROUPS } from './settingsGroups';
import type { SettingsGroupId, SettingsSectionId } from './types';

/**
 * The Settings side nav: the groups as quiet mono labels; the open one carries the blaze cursor and lists its
 * sections, the one a link asked for marked. On a phone it is the whole first screen, one row per group (its name,
 * how many sections, one line on what it's for) drilling into the group.
 */
export function SettingsNav(props: {
  current?: SettingsGroupId;
  section?: SettingsSectionId;
  onPick: (group: SettingsGroupId) => void;
  onSection: (group: SettingsGroupId, section: SettingsSectionId) => void;
  drill?: boolean;
}) {
  if (props.drill) {
    return (
      <nav className="sp-nav sp-drill" aria-label="Settings groups">
        <ul>
          {SETTINGS_GROUPS.map((g) => (
            <li key={g.id}>
              <button type="button" className="sp-drill-row" onClick={() => props.onPick(g.id)}>
                <LabelLine className="sp-drill-label" parts={[g.label, String(g.sections.length)]} />
                <span className="sp-drill-why">{g.blurb}</span>
                <span className="sp-drill-chev" aria-hidden="true">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav className="sp-nav" aria-label="Settings groups">
      <ul>
        {SETTINGS_GROUPS.map((g) => {
          const on = g.id === props.current;
          return (
            <li key={g.id}>
              <button
                type="button"
                className={cx('sp-grp', on && 'on')}
                aria-current={on ? 'page' : undefined}
                onClick={() => props.onPick(g.id)}
              >
                {g.label}
                {on && <Cursor still />}
              </button>
              {on && (
                <ul className="sp-subs">
                  {g.sections.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={cx('sp-sub', props.section === s.id && 'on')}
                        onClick={() => props.onSection(g.id, s.id)}
                      >
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
