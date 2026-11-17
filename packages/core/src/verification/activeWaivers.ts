import { journalFile } from '../history/journalFile';
import type { CheckWaiver } from '../model/checkWaiver';
import { checkWaivers } from './checkWaivers';

/**
 * The ticket's waivers in force: not undone, and given after the ticket was last reopened (a reopened ticket's
 * checks all run again, the way Undo would have it).
 */
export function activeWaivers(root: string, mapId: string, ticketId: string): CheckWaiver[] {
  const live = checkWaivers.list(root, mapId, ticketId).filter((w) => !w.undone);
  if (!live.length) return [];
  const reopened = journalFile(root)
    .read(mapId)
    .filter((e) => e.ticketId === ticketId && e.event === 'reopen')
    .reduce((last, e) => Math.max(last, e.at), 0);
  return live.filter((w) => w.at > reopened);
}
