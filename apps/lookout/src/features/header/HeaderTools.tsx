import { Button } from '../../components/ui';
import { managedThemeFixed } from '../../lib/managedTheme';
import { ManagedMenu } from './ManagedMenu';
import { PhoneMoreMenu } from './PhoneMoreMenu';
import type { RecordsProps } from './RecordsItems';
import { RecordsMenu } from './RecordsMenu';
import { ThemeToggle } from './ThemeToggle';
import type { PhoneFocus } from './types';

/**
 * The end of the header: Records, Settings, the theme and the person's menu behind a server's own sign-in; on a phone,
 * all of them (and focus) in More, so the controls stay on one row.
 */
export function HeaderTools(props: {
  phone?: boolean;
  phoneFocus?: PhoneFocus;
  records: RecordsProps;
  onSettings: () => void;
  onToggleTheme: (night: boolean) => void;
}) {
  if (props.phone)
    return (
      <PhoneMoreMenu
        focus={props.phoneFocus}
        records={props.records}
        onSettings={props.onSettings}
        onToggleTheme={props.onToggleTheme}
      />
    );
  return (
    <>
      <RecordsMenu {...props.records} />
      <Button variant="ghost" onClick={props.onSettings} data-tip="Tracker, verification, appearance and integrations">
        Settings
      </Button>
      {/* Behind a server's own sign-in, its theme wins; the toggle stays when the server saves a theme picked here (lib/managedTheme.ts). */}
      {managedThemeFixed() ? null : <ThemeToggle onToggle={props.onToggleTheme} />}
      <ManagedMenu />
    </>
  );
}
