import type { RerouteProposal } from '../../model/reroute';
import { settingShapeError } from '../../planning/reroute/settingShape';
import { settingAsk } from '../../planning/reroute/settingText';
import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

/** What a challenge to the destination says, in a few words. */
const DESTINATION_REASON: Record<NonNullable<RerouteProposal['destinationReason']>, string> = {
  'already-exists': 'the work already exists',
  'wrong-problem': 'the trail targets the wrong problem',
  rescope: 'the trail should be rescoped',
};

/** Pending reroute proposals: the tickets they touch are frozen until the trail lead approves or rejects. */
export const rerouteSource: AttentionSource = {
  kind: 'reroute',
  collect({ reroutes = [] }) {
    return reroutes.map(({ proposal: p, frozen }): Candidate => {
      // a setting request shown as one line only when it is one setting change (settingShape.ts)
      if (p.lane === 'setting' && !settingShapeError(p)) return settingCandidate(p);
      const notes = [p.kind === 'challenge-destination' ? 'wrong mountain?' : 'proposes a new plan'];
      if (p.destinationReason) notes.push(DESTINATION_REASON[p.destinationReason]);
      if (frozen.length) notes.push(`closes ${frozen.length} ticket${frozen.length === 1 ? '' : 's'}`);
      if (p.wide) notes.push(`touches ${p.wide.touched} of ${p.wide.open} open tickets, so nothing is frozen`);
      return {
        kind: 'reroute',
        mapId: p.mapId,
        title: clip(`Review ${p.id}: ${p.reason}`),
        since: p.at,
        urgency: 'soon',
        ref: p.id,
        agent: p.by,
        holds: frozen,
        notes,
      };
    });
  },
};

/** A request to change one of the trail lead's settings: what, by whom, and that nothing changes until they approve. */
function settingCandidate(p: RerouteProposal): Candidate {
  return {
    kind: 'reroute',
    mapId: p.mapId,
    title: clip(`${settingAsk(p)} (${p.id})`),
    since: p.at,
    urgency: 'soon',
    ref: p.id,
    agent: p.by,
    holds: [],
    notes: ['your setting: approve or decline', clip(p.evidence)],
  };
}
