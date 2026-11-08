import type { InstalledRole } from '../../model/role';
import type { AttentionSource, Candidate } from '../types';

const TITLES: Record<string, (id: string) => string> = {
  tampered: (id) => `Role ${id} changed since you approved it`,
  unapproved: (id) => `Approve role ${id} before agents use it`,
  invalid: (id) => `Role ${id} can't be used`,
};

/** Tickets that ask for a role, by role id. */
function ticketsByRole(input: Parameters<AttentionSource['collect']>[0]) {
  const out = new Map<string, string[]>();
  for (const s of input.snaps)
    for (const t of s.tickets)
      if (t.role && t.state === 'open') out.set(t.role, [...(out.get(t.role) ?? []), t.id]);
  return out;
}

/**
 * Roles agents can't use: a file edited after approval (tampered), one not approved yet, or one that fails the lint.
 * Their tickets get no role instructions until the trail lead approves the file again or removes it.
 */
export const roleSource: AttentionSource = {
  kind: 'role',
  collect(input) {
    const using = ticketsByRole(input);
    return (input.roles ?? [])
      .filter((r): r is InstalledRole & { status: 'tampered' | 'unapproved' | 'invalid' } => r.status !== 'active')
      .map((r): Candidate => {
        const tickets = using.get(r.id) ?? [];
        return {
          kind: 'role',
          mapId: '',
          title: TITLES[r.status](r.id),
          since: r.lock ? Date.parse(r.lock.addedAt) || input.now : input.now,
          urgency: r.status === 'tampered' && tickets.length ? 'blocking' : 'soon',
          ref: r.id,
          holds: tickets,
          notes: [r.reason ?? r.status, ...(tickets.length ? [`${tickets.length} open tickets use it`] : [])],
          batchKey: 'roles',
        };
      });
  },
};
