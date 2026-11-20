import type { TrailReadiness } from '../../model/readiness';
import type { AttentionSource, Candidate } from '../types';
import { clip } from './clip';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** What the item says it holds: ready tickets now, new work as it comes up, or why nothing waits on it. */
function holdNote(held: TrailReadiness[]) {
  const tickets = held.flatMap((h) => h.tickets).length;
  if (tickets) return `${plural(tickets, 'ready ticket')} held back`;
  if (held.some((h) => h.waits)) return 'new implementation work waits on it';
  if (held.some((h) => h.started)) return 'you started the trails anyway';
  return "no trail's work is verified with checks yet";
}

/**
 * The repo isn't ready for Teamtrail to check work here (readiness/): checks that can't run, a program they start
 * that isn't installed, no checks at all. One item for the project; it opens Settings → Project → Repo readiness.
 * Blocking while it holds a trail's implementation work; asked soon otherwise (the trail lead started the trails
 * anyway, or no trail's work is verified with checks). What only warns stays on that screen.
 */
export const readinessSource: AttentionSource = {
  kind: 'readiness',
  collect({ readiness, now }) {
    const r = readiness?.readiness;
    const blocking = r?.findings.filter((f) => f.level === 'blocks') ?? [];
    if (!r || !blocking.length) return [];
    const held = readiness!.held;
    const more = blocking.length - 1;
    const waits = held.some((h) => h.waits);
    const c: Candidate = {
      kind: 'readiness',
      mapId: '',
      title: clip(blocking[0].text),
      since: now,
      urgency: waits ? 'blocking' : 'soon',
      ref: 'readiness',
      holds: held.flatMap((h) => h.tickets),
      notes: [...(more ? [`and ${plural(more, 'more thing')} in Repo readiness`] : []), holdNote(held)],
      batchKey: 'readiness',
    };
    return [c];
  },
};
