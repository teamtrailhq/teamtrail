import type { QueuedChange, QueuedWrite } from './types';

type Obj = Record<string, unknown>;
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const obj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** What each kind of change must carry to be sent; anything else in a queue file is dropped, never replayed. */
const SHAPES: Record<QueuedChange['kind'], (c: Obj) => boolean> = {
  mode: (c) => str(c.mode),
  archived: (c) => typeof c.archived === 'boolean',
  sections: (c) => obj(c.sections),
  mapMeta: (c) => obj(c.patch),
  blocking: (c) => str(c.blockerId) && str(c.blockedId),
  unblocking: (c) => str(c.blockerId) && str(c.blockedId),
  edit: (c) => str(c.ticketId) && obj(c.edit),
  reopen: (c) => str(c.ticketId),
  claim: (c) => str(c.ticketId) && (c.assignee === undefined || typeof c.assignee === 'string'),
  meta: (c) => str(c.ticketId) && obj(c.patch),
  comment: (c) => str(c.ticketId) && str(c.author) && typeof c.body === 'string',
  close: (c) => str(c.ticketId) && (c.reason === 'completed' || c.reason === 'not_planned'),
  decision: (c) => obj(c.decision) && str(c.decision.id),
  supersede: (c) => str(c.decisionId) && str(c.supersededBy),
};

/** Whether a line of a queue file is a write Teamtrail could have queued: a known kind with its fields. */
export function isQueuedWrite(w: unknown): w is QueuedWrite {
  if (!obj(w) || !str(w.id) || !str(w.mapId) || typeof w.at !== 'number' || !obj(w.change)) return false;
  const shape = SHAPES[w.change.kind as QueuedChange['kind']];
  return typeof w.label === 'string' && !!shape && shape(w.change);
}
