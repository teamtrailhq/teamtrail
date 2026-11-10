import { readLease } from '../agents/leaseStore';
import type { Ticket } from '../model/types';
import { readAttempts } from './evidenceStore';

export interface Reviewer {
  agent: string;
  /** Every session this reviewer's connection has opened. */
  sessionIds: string[];
  /** Who is behind the reviewer: `token:<id>` for a remote agent, `local:<id>` for a connection on this machine. */
  origin?: string;
}

/** Why one origin is not independent of itself, in the reviewer's words. */
const sameOrigin = (origin: string) =>
  origin.startsWith('token:') ? 'an agent on your remote token' : 'your own connection';

/**
 * Why `who` may not review `t`, or undefined when they may: the reviewer must
 * not be its assignee or appear, by trail name, session or origin, in any of
 * its attempts or its claim. A trail name is not an identity: one remote token
 * may hold several sessions under different names, so the token is compared too.
 */
export function reviewConflict(root: string, mapId: string, t: Ticket, who: Reviewer): string | undefined {
  const lease = readLease(root, mapId, t.id);
  const people = [
    ...readAttempts(root, mapId, t.id).map((a) => ({ agent: a.agent, sessionId: a.sessionId, origin: a.origin })),
    ...(lease ? [{ agent: lease.agent, sessionId: lease.sessionId, origin: lease.origin }] : []),
    ...(t.assignee ? [{ agent: t.assignee, sessionId: undefined, origin: undefined }] : []),
  ];
  const sessions = new Set(who.sessionIds);
  if (people.some((p) => p.agent === who.agent)) return `${who.agent} worked on ${t.key}, so another agent reviews it`;
  if (people.some((p) => p.sessionId && sessions.has(p.sessionId)))
    return `this connection worked on ${t.key}, so another agent reviews it`;
  if (who.origin && people.some((p) => p.origin === who.origin))
    return `${sameOrigin(who.origin)} worked on ${t.key}, so an agent with another one reviews it`;
  return undefined;
}
