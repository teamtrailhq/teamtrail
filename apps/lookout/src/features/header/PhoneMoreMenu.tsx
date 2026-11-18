import { cx } from '../../lib';
import { managedSignIn } from '../../lib/managedSignIn';
import { managedThemeFixed } from '../../lib/managedTheme';
import { HeaderMenu } from './HeaderMenu';
import { ManagedItems } from './ManagedItems';
import { type RecordsProps, RecordsItems } from './RecordsItems';
import { ThemeItem } from './ThemeItem';
import type { PhoneFocus } from './types';

/**
 * A phone's header keeps one row of controls: the mode switch, what needs you, and this. Everything else the header
 * offers elsewhere is in it: focus and what it holds back, the records, Settings, the theme and, behind a server's
 * own sign-in, the person's places and Sign out. Its dot says focus is on; a badge, that records wait on you.
 */
export function PhoneMoreMenu(props: {
  focus?: PhoneFocus;
  records: RecordsProps;
  onSettings: () => void;
  onToggleTheme: (night: boolean) => void;
}) {
  const { focus, records } = props;
  const managed = managedSignIn();
  const focusOn = !!focus && focus.state !== 'off';
  const badge = (
    <>
      {focusOn && (
        <span className={cx('focus-state', `focus-${focus.state}`)} aria-label="focus on">
          <i className="focus-dot" />
        </span>
      )}
      {records.knowledge > 0 && <span className="n hot">{records.knowledge}</span>}
      {records.briefingStatus === 'new' && <span className="new-dot" aria-label="new trip report" />}
    </>
  );
  return (
    <HeaderMenu className="phone-more" label="⋯" ariaLabel="More" badge={badge} role="dialog">
      {(close) => (
        <>
          {focus && <div className="phone-more-focus">{focus.panel(close)}</div>}
          <div role="menu" aria-label="More" className="phone-more-items">
            <RecordsItems {...records} close={close} />
            <button
              role="menuitem"
              className="header-menu-item"
              onClick={() => {
                close();
                props.onSettings();
              }}
            >
              Settings
            </button>
            {managedThemeFixed() ? null : <ThemeItem onToggle={props.onToggleTheme} close={close} />}
            {managed && <ManagedItems managed={managed} close={close} />}
          </div>
        </>
      )}
    </HeaderMenu>
  );
}
