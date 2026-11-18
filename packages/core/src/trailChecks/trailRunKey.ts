import type { TicketMerge } from '../model/trailChecks';

/**
 * What a run for a trail is for: the approved checks and each done ticket's work, and whether the default branch here
 * holds it (so pulling main makes a new run due). The same key is never started again by itself, so a failed or
 * unavailable run waits for the trail lead (Run again) or for the trail to change.
 */
export function trailRunKey(configHash: string, merges: TicketMerge[]): string {
  const parts = merges
    .map((m) => `${m.ticketId}:${m.state}:${m.commit ?? ''}:${m.contained === false ? 'absent' : ''}`)
    .sort()
    .join(',');
  return `${configHash}|${parts}`;
}
