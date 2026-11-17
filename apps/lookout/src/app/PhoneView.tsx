import type { ReactNode } from 'react';

/**
 * The single phone view: a page or full view that covers the map (Plan, Activity, the Logbook, Settings, Trail
 * stats), else the map with its bubble as a sheet under it, then the trail bar and its lists, and other projects.
 */
export function PhoneView(props: {
  covered: ReactNode;
  map: ReactNode;
  trailBar: ReactNode;
  /** Other projects (renders nothing with one project). */
  projects?: ReactNode;
}) {
  if (props.covered) return <main className="phone-view">{props.covered}</main>;
  return (
    <main className="phone-view phone-map">
      {props.map}
      {props.trailBar}
      {props.projects}
    </main>
  );
}
