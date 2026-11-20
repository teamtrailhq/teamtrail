import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

/**
 * The repo isn't ready for Teamtrail to check work here (readiness/): checks that can't run, a program they start
 * that isn't installed, no checks at all. Blocking, one item for the project, whether or not a trail is held yet; it
 * opens Settings → Project → Repo readiness. What only warns stays on that screen.
 */
export const readinessSource: AttentionSource = {
  kind: 'readiness',
  collect({ readiness, now }) {
    const r = readiness?.readiness;
    const blocking = r?.findings.filter((f) => f.level === 'blocks') ?? [];
    if (!r || !blocking.length) return [];
    const held = readiness!.held.flatMap((h) => h.tickets);
    const more = blocking.length - 1;
    const c: Candidate = {
      kind: 'readiness',
      mapId: '',
      title: clip(blocking[0].text),
      since: now,
      urgency: 'blocking',
      ref: 'readiness',
      holds: held,
      notes: [
        ...(more ? [`and ${more} more thing${more === 1 ? '' : 's'} in Repo readiness`] : []),
        held.length ? `${held.length} ready ticket${held.length === 1 ? '' : 's'} held back` : 'new work waits on it',
      ],
      batchKey: 'readiness',
    };
    return [c];
  },
};
