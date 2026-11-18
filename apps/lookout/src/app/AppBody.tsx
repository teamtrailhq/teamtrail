import type { ReactNode } from 'react';
import { PhoneView } from './PhoneView';

/**
 * Under the header: Hands-off's home, else the map and the trail bar, with a page covering them when one is open.
 * On a phone, one view at a time and the tab bar of views (none in Hands-off: its home is the one view).
 */
export function AppBody(props: {
  phone: boolean;
  /** Hands-off's home; nothing in Hands-on, or before there is a trail. */
  home: ReactNode;
  map: ReactNode;
  trailBar: ReactNode;
  covered: ReactNode;
  projects: ReactNode;
  tabBar: ReactNode;
}) {
  const { home, covered } = props;
  if (props.phone)
    return (
      <>
        <PhoneView
          covered={covered}
          map={home || props.map}
          trailBar={home ? undefined : props.trailBar}
          projects={props.projects}
        />
        {home ? null : props.tabBar}
      </>
    );
  if (home) return <>{covered || home}</>;
  return (
    <>
      {props.map}
      {props.trailBar}
      {covered}
    </>
  );
}
