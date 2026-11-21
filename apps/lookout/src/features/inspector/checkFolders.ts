import type { TicketView } from './useTicketView';

/**
 * Each check's folder as its attempt recorded it (repo-relative, `.` for the root), from the attempt the ticket's
 * proof is of, for the proof's check lines to name a folder that isn't the root.
 */
export function checkFolders(v: Pick<TicketView, 'proof' | 'verification'>): ReadonlyMap<string, string> | undefined {
  const id = v.proof?.proof.attempt.id;
  const attempt = id ? v.verification?.attempts.find((a) => a.id === id) : undefined;
  if (!attempt) return undefined;
  return new Map(attempt.checks.map((c) => [c.name, c.cwd]));
}
