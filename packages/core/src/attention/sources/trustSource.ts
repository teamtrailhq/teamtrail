import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

const TITLES = {
  elsewhere: (title: string) => `Approve on this machine: ${title}`,
  changed: (title: string) => `Changed since you approved it: ${title}`,
};

/**
 * What the repo's files ask this machine to trust that the trail lead hasn't approved here (trust/pendingTrust.ts),
 * and a trackers.json that names another tracker. Nothing of it opens a gate or runs until they approve. The check
 * commands and the tracker hold work up, so they block; the rest is asked soon.
 */
export const trustSource: AttentionSource = {
  kind: 'trust',
  collect({ trust = [], trackerPending, legacyOutbox, now }) {
    const items = trust.map((t): Candidate => ({
      kind: 'trust',
      mapId: t.mapId ?? '',
      ...(t.ticketId ? { ticketId: t.ticketId } : {}),
      title: clip(TITLES[t.standing](t.title)),
      since: now,
      urgency: t.kind === 'checks' ? 'blocking' : 'soon',
      ref: t.key,
      holds: [],
      notes: [...t.lines.slice(0, 2), ...t.warnings.slice(0, 1)].map((l) => clip(l, 120)),
      batchKey: 'trust',
    }));
    if (legacyOutbox)
      items.unshift({
        kind: 'trust',
        mapId: '',
        title: clip(`${legacyOutbox.writes} tracker writes queued before the upgrade wait for you`),
        since: now,
        urgency: 'soon',
        ref: 'legacy-outbox',
        holds: [],
        notes: [`for ${legacyOutbox.targets.join(', ')}; send or discard them in Settings → Approvals`],
        batchKey: 'trust',
      });
    if (!trackerPending) return items;
    const tracker: Candidate = {
      kind: 'trust',
      mapId: '',
      title: clip(`trackers.json now points at ${trackerPending.label}`),
      since: now,
      urgency: 'blocking',
      ref: 'tracker',
      holds: [],
      notes: [`nothing is read or sent there until you approve; using ${trackerPending.approved} meanwhile`],
      batchKey: 'trust',
    };
    return [tracker, ...items];
  },
};
