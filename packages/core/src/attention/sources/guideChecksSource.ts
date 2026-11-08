import type { AttentionSource, Candidate } from '../types';

/** Check commands an approved guide proposes that the trail lead hasn't approved yet. They don't run until then. */
export const guideChecksSource: AttentionSource = {
  kind: 'guide-checks',
  collect({ guides = [], now }) {
    return guides
      .filter((r) => r.status === 'active' && r.pendingChecks.length && r.guide)
      .map((r): Candidate => ({
        kind: 'guide-checks',
        mapId: '',
        title: `Approve the checks guide ${r.id} proposes`,
        since: r.lock ? Date.parse(r.lock.addedAt) || now : now,
        urgency: 'soon',
        ref: r.id,
        holds: [],
        notes: r.pendingChecks.map((n) => `${n}: ${r.guide!.proposedChecks[n].run.join(' ')}`),
        batchKey: 'guides',
      }));
  },
};
