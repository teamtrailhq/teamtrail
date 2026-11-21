import type { ActivityState, MapSnapshot, TicketLease, TrailDone } from '@teamtrail/core';
import type { Selection } from '../../lib';
import { TrailDoneStep } from '../trail-done';
import { AgentLanes } from './AgentLanes';

/** The Activity page's agents: once the trail is done, that it is, above the lanes. */
export function ActivityAgents(props: {
  activity: ActivityState;
  snap?: MapSnapshot;
  leases?: TicketLease[];
  done?: TrailDone;
  onSelect: (s: Selection) => void;
  onOpenChat: (id: string) => void;
}) {
  const { done } = props;
  return (
    <>
      {done && done.kind !== 'not-done' && <TrailDoneStep done={done} />}
      <AgentLanes
        snap={props.snap}
        activity={props.activity}
        leases={props.leases}
        onSelect={props.onSelect}
        onOpenChat={props.onOpenChat}
      />
    </>
  );
}
