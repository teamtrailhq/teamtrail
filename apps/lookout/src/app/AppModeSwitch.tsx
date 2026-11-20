import { useEffect } from 'react';
import { ModeSwitch, PageBack } from '../features/hands-off';
import type { useLookoutMode } from '../hooks';
import type { useAppNavigation } from './useAppNavigation';

/**
 * Hands-off or Hands-on in the header, led by Back while a page covers Hands-off's home (it has no bar of views). It
 * tells navigation the mode too: Hands-off has no map to put a bubble on, so a ticket opened anywhere opens as the
 * full ticket.
 */
export function AppModeSwitch(props: {
  mode: ReturnType<typeof useLookoutMode>;
  nav: ReturnType<typeof useAppNavigation>;
  /** Settings covers the page: it has its own way back. */
  settingsOpen: boolean;
}) {
  const { mode, nav } = props;
  const { setHandsOff } = nav;
  useEffect(() => setHandsOff(mode.handsOff), [setHandsOff, mode.handsOff]);
  const back = mode.handsOff && !!nav.page && !props.settingsOpen;
  return (
    <>
      {back && <PageBack onBack={nav.toMap} />}
      <ModeSwitch mode={mode.mode} onChange={mode.setMode} />
    </>
  );
}
