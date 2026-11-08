import type { ReactNode } from 'react';
import { Panel } from '../components/ui';
import type { PhoneTab } from './tabs';

/** The single phone view: an open decisions view covers it, otherwise the selected tab's layer. */
export function PhoneView(props: {
  tab: PhoneTab;
  decisions: ReactNode;
  inbox: ReactNode;
  /** Other projects, above the inbox on the home tab (renders nothing with one project). */
  projects?: ReactNode;
  map: ReactNode;
  ticket: ReactNode;
  activity: ReactNode;
  plan: ReactNode;
}) {
  const layers: Record<PhoneTab, ReactNode> = {
    home: props.projects ? (
      <div className="phone-home">
        {props.projects}
        {props.inbox}
      </div>
    ) : (
      props.inbox
    ),
    map: props.map,
    ticket: <Panel className="zone">{props.ticket}</Panel>,
    activity: <Panel className="zone">{props.activity}</Panel>,
    plan: props.plan,
  };
  return <main className="phone-view">{props.decisions || layers[props.tab]}</main>;
}
