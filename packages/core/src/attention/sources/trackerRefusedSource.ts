import { refusedGroups, type RefusedGroup } from '../../adapters/remote/refusedGroups';
import type { RefusedWrite } from '../../adapters/remote/sync/types';
import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

const TRACKER = { github: 'GitHub', linear: 'Linear' } as const;

/** What to do, said once per item. */
const TO_DO = "it didn't happen in the tracker: fix access or the issue, then retry, or discard it";
const TO_DO_ALL = "they didn't happen in the tracker: fix access or the issues, then retry, or discard them";

const said = (r: RefusedWrite) => `${TRACKER[r.tracker]} said: ${clip(r.error, 160)}`;

function single(g: RefusedGroup, r: RefusedWrite): Candidate {
  const by = r.write.by ? [`made by ${r.write.by}`] : [];
  return {
    kind: 'tracker-refused',
    mapId: g.mapId,
    ...(g.ticketId ? { ticketId: g.ticketId } : {}),
    title: clip(`${TRACKER[r.tracker]} refused a write: ${r.write.label}`),
    since: r.at,
    urgency: 'soon',
    ref: g.ref,
    holds: [],
    notes: [said(r), ...by, TO_DO],
    ...(r.url ? { url: r.url } : {}),
  };
}

function grouped(g: RefusedGroup): Candidate {
  const [first] = g.writes;
  const reasons = [...new Set(g.writes.map(said))];
  const url = g.ticketId ? first.url : undefined;
  return {
    kind: 'tracker-refused',
    mapId: g.mapId,
    ...(g.ticketId ? { ticketId: g.ticketId } : {}),
    title: clip(
      `${TRACKER[first.tracker]} refused ${g.writes.length} writes: ${g.writes.map((r) => r.write.label).join(', ')}`,
    ),
    since: first.at,
    urgency: 'soon',
    ref: g.ref,
    holds: [],
    notes: [...reasons.slice(0, 3), TO_DO_ALL],
    ...(url ? { url } : {}),
  };
}

/**
 * Writes GitHub or Linear refused for good (lost access, a deleted issue, a validation error, a body too large): a
 * claim, a status, a close or a settings change that never happened in the tracker. One item per write, or one per
 * trail when there are many (refusedGroups.ts); the trail lead retries or discards them (refusedWriteRoutes.ts).
 * Every refusal changes the item's ref, so setting one aside never hides the next.
 */
export const trackerRefusedSource: AttentionSource = {
  kind: 'tracker-refused',
  collect({ trackerRefused = [] }) {
    return refusedGroups(trackerRefused).map((g) => (g.writes.length === 1 ? single(g, g.writes[0]) : grouped(g)));
  },
};
