import type { InstalledGuide } from '../../model/guide';
import type { AttentionSource, Candidate } from '../types';

const TITLES: Record<string, (id: string) => string> = {
  tampered: (id) => `Guide ${id} changed since you approved it`,
  unapproved: (id) => `New guide ${id} is waiting for your approval`,
  invalid: (id) => `Guide ${id} can't be used`,
};

/** Tickets that ask for a guide, by guide id. */
function ticketsByGuide(input: Parameters<AttentionSource['collect']>[0]) {
  const out = new Map<string, string[]>();
  for (const s of input.snaps)
    for (const t of s.tickets) if (t.guide && t.state === 'open') out.set(t.guide, [...(out.get(t.guide) ?? []), t.id]);
  return out;
}

/**
 * Guides agents can't use: a file edited after approval (tampered), one not approved yet, or one that fails the lint.
 * Their tickets get no guide instructions until the trail lead approves the file again or removes it.
 */
export const guideSource: AttentionSource = {
  kind: 'guide',
  collect(input) {
    const using = ticketsByGuide(input);
    return (input.guides ?? [])
      .filter((r): r is InstalledGuide & { status: 'tampered' | 'unapproved' | 'invalid' } => r.status !== 'active')
      .map((r): Candidate => {
        const tickets = using.get(r.id) ?? [];
        return {
          kind: 'guide',
          mapId: '',
          title: TITLES[r.status](r.id),
          since: r.lock ? Date.parse(r.lock.addedAt) || input.now : input.now,
          urgency: r.status === 'tampered' && tickets.length ? 'blocking' : 'soon',
          ref: r.id,
          holds: tickets,
          notes: [r.reason ?? r.status, ...(tickets.length ? [`${tickets.length} open tickets use it`] : [])],
          batchKey: 'guides',
        };
      });
  },
};
