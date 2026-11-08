import type { AttentionSource, Candidate } from '../types';

/** Check commands an approved role proposes that the trail lead hasn't approved yet. They don't run until then. */
export const roleChecksSource: AttentionSource = {
  kind: 'role-checks',
  collect({ roles = [], now }) {
    return roles
      .filter((r) => r.status === 'active' && r.pendingChecks.length && r.role)
      .map((r): Candidate => ({
        kind: 'role-checks',
        mapId: '',
        title: `Approve the checks role ${r.id} proposes`,
        since: r.lock ? Date.parse(r.lock.addedAt) || now : now,
        urgency: 'soon',
        ref: r.id,
        holds: [],
        notes: r.pendingChecks.map((n) => `${n}: ${r.role!.proposedChecks[n].run.join(' ')}`),
        batchKey: 'roles',
      }));
  },
};
