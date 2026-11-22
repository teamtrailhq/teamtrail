import type { RepoReadiness } from '../model/readiness';
import { NEW_REPO_FINDING } from '../model/setupTicket';
import type { MapSnapshot, TicketType } from '../model/types';

/** The ticket types that change code: only one of them can set a project up. */
const SETUP_TYPES: TicketType[] = ['task', 'execute'];

/**
 * Why a ticket can't be its trail's setup ticket (model/setupTicket.ts), or undefined when it can: only a task or
 * execute ticket, only while readiness says the repo is new (no project, no approved checks), and only one per
 * trail. Once the repo has a project, its checks come from Settings → Verification, so marking a later ticket can't
 * get it past them.
 */
export function setupRefusal(o: { readiness: RepoReadiness; snap: MapSnapshot; type: TicketType }): string | undefined {
  if (!SETUP_TYPES.includes(o.type))
    return `A setup ticket changes code: make it a task or execute ticket, not ${o.type}`;
  if (!o.readiness.findings.some((f) => f.id === NEW_REPO_FINDING))
    return 'Only a new repo gets a setup ticket: this one already has a project, so its checks are set in the Lookout (Settings → Verification)';
  const other = o.snap.tickets.find((t) => t.setup);
  if (other) return `Trail ${o.snap.map.key} already has its setup ticket, ${other.key}`;
  return undefined;
}
