import type { ReviewLoad } from '../model/reviewLoad';

const SHOWN = 4;

/**
 * Why agents start no new implementation work, for the agent and the human: how much waits, which tickets, and the
 * team's limit. Undefined while the queue is under the limit.
 */
export function reviewLimitReason(load: ReviewLoad): string | undefined {
  if (!load.full || !load.limit) return undefined;
  const n = load.waiting.length;
  const keys = load.waiting
    .slice(0, SHOWN)
    .map((w) => (w.via === 'pull-request' ? `${w.ticketKey} (PR)` : w.ticketKey));
  const more = n > SHOWN ? `, and ${n - SHOWN} more` : '';
  return `Review limit reached: ${n} finished ticket${n === 1 ? '' : 's'} wait for the human's review (${keys.join(', ')}${more}), and the team's limit is ${load.limit}. New implementation work waits until some are reviewed. Meanwhile work rework, research, junction or review tickets, or tell the human what is waiting.`;
}
