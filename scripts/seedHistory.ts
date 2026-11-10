// A finished sample trail with two vendors' work on it, so Trail stats has differences to show. The numbers are
// made up and deliberately even-handed: each vendor comes out ahead on something, because this appears in marketing.
// Its journal is
// written the way a real run writes it. The trail finished `finishedAt` (seedTimeline dates its files to then), so its
// claims are dated back from that moment.
import { type MapSnapshot, type TicketType, type TrackerAdapter, type TransitionEntry } from '@teamtrail/core';
import { journalFile } from '@teamtrail/core/agents';

const MIN = 60_000;

interface Work {
  title: string;
  type: TicketType;
  agent: string;
  leadMin: number;
  /** Times the trail lead sent it back. */
  reworks?: number;
  /** Who reviewed it, and whether the failure they raised stood. */
  review?: { by: string; verdict: 'pass' | 'fail' | 'overruled' };
}

const WORK: Work[] = [
  {
    title: 'How do other note apps rank search results?',
    type: 'research',
    review: { by: 'codex-01', verdict: 'pass' },
    agent: 'claude-01',
    leadMin: 34,
  },
  { title: 'Index size on a 10k note library', type: 'research', agent: 'claude-02', leadMin: 41 },
  { title: 'Which fields should search cover?', type: 'research', agent: 'claude-01', leadMin: 28 },
  {
    title: 'SQLite FTS5 on iOS and Android',
    type: 'research',
    review: { by: 'codex-02', verdict: 'pass' },
    agent: 'claude-02',
    leadMin: 46,
  },
  { title: 'Search latency on older phones', type: 'research', agent: 'claude-01', leadMin: 38 },
  {
    title: 'Stemming across the languages we support',
    type: 'research',
    review: { by: 'claude-01', verdict: 'pass' },
    agent: 'codex-01',
    leadMin: 82,
  },
  {
    title: 'What do users search for today?',
    type: 'research',
    review: { by: 'claude-02', verdict: 'pass' },
    agent: 'codex-02',
    leadMin: 96,
  },
  { title: 'Fuzzy matching: worth the index cost?', type: 'research', agent: 'codex-01', leadMin: 74 },
  { title: 'Attachment text: index it or skip it?', type: 'research', agent: 'codex-02', leadMin: 88 },
  { title: 'Highlighting matches in long notes', type: 'research', agent: 'codex-01', leadMin: 79 },
  { title: 'Prototype search-as-you-type on a 10k note library', type: 'prototype', agent: 'claude-02', leadMin: 74 },
  { title: 'Prototype the results screen with snippets', type: 'prototype', agent: 'codex-02', leadMin: 66 },
  { title: 'Sign off the search index ADR', type: 'task', agent: 'claude-01', leadMin: 18 },
  { title: 'Write the search release notes', type: 'task', agent: 'codex-01', leadMin: 21 },
  {
    title: 'Build the search index on first launch',
    type: 'execute',
    agent: 'codex-01',
    leadMin: 33,
    review: { by: 'claude-01', verdict: 'fail' },
  },
  {
    title: 'Update the index when a note changes',
    type: 'execute',
    agent: 'codex-02',
    leadMin: 26,
    review: { by: 'claude-02', verdict: 'fail' },
  },
  {
    title: 'Search box in the note list',
    type: 'execute',
    agent: 'codex-01',
    leadMin: 31,
    reworks: 1,
    review: { by: 'claude-01', verdict: 'fail' },
  },
  {
    title: 'Rank results by match and recency',
    type: 'execute',
    agent: 'codex-02',
    leadMin: 37,
    reworks: 1,
    review: { by: 'claude-02', verdict: 'fail' },
  },
  {
    title: 'Highlight matches in the results',
    type: 'execute',
    agent: 'codex-01',
    leadMin: 30,
    review: { by: 'claude-01', verdict: 'overruled' },
  },
  {
    title: 'Keep search working offline',
    type: 'execute',
    agent: 'claude-01',
    leadMin: 62,
    review: { by: 'codex-01', verdict: 'fail' },
  },
  {
    title: 'Recent searches on the search screen',
    type: 'execute',
    agent: 'claude-02',
    leadMin: 58,
    review: { by: 'codex-02', verdict: 'overruled' },
  },
  {
    title: 'Empty and no-result states',
    type: 'execute',
    agent: 'claude-01',
    leadMin: 44,
    review: { by: 'codex-01', verdict: 'overruled' },
  },
  {
    title: 'Clear the index when a user signs out',
    type: 'execute',
    agent: 'claude-02',
    leadMin: 71,
    review: { by: 'codex-02', verdict: 'overruled' },
  },
  {
    title: 'Search result counts in the note list',
    type: 'execute',
    agent: 'claude-01',
    leadMin: 39,
    review: { by: 'codex-01', verdict: 'fail' },
  },
];

const entry = (
  map: MapSnapshot['map'],
  t: { id: string; key: string },
  at: number,
  patch: Pick<TransitionEntry, 'event' | 'from' | 'to' | 'actor' | 'actorKind'>,
): TransitionEntry => ({ v: 1, kind: 'transition', at, mapId: map.id, ticketId: t.id, ticketKey: t.key, ...patch });

const claimOf = (actor: string) => ({
  event: 'claim' as const,
  from: 'ready' as const,
  to: 'working' as const,
  actor,
  actorKind: 'agent' as const,
});

export async function seedHistory({
  root,
  adapter,
  finishedAt,
}: {
  root: string;
  adapter: TrackerAdapter;
  finishedAt: number;
}) {
  const map = await adapter.createMap({
    title: 'Search across notes',
    mode: 'plan+execute',
    sections: {
      destination: 'Users find any note by what it says, online or off, in under a second.',
      notes: '',
      decisions: [],
      unspecified: [],
      outOfScope: [],
    },
  });
  const journal = journalFile(root);
  for (const w of WORK) {
    const t = await adapter.createTicket(map.id, { title: w.title, type: w.type, body: '', hitl: false });
    const start = finishedAt - w.leadMin * MIN;
    journal.append(entry(map, t, start, claimOf(w.agent)));
    for (let r = 0; r < (w.reworks ?? 0); r++) {
      journal.append(
        entry(map, t, start + (r + 1) * 5 * MIN, {
          event: 'reject',
          from: 'verifying',
          to: 'rework',
          actor: 'trail lead',
          actorKind: 'trail lead',
        }),
      );
    }
    if (w.review) await seedReview({ root, adapter, map, work: t, start, review: w.review });
    await adapter.assign(map.id, t.id, w.agent);
    await adapter.close(map.id, t.id, 'completed');
  }
  return map;
}

async function seedReview({
  root,
  adapter,
  map,
  work,
  start,
  review,
}: {
  root: string;
  adapter: TrackerAdapter;
  map: MapSnapshot['map'];
  work: { id: string; key: string };
  start: number;
  review: NonNullable<Work['review']>;
}) {
  const journal = journalFile(root);
  const r = await adapter.createTicket(map.id, { title: `Review ${work.key}`, type: 'review', body: '', hitl: false });
  await adapter.setMeta(map.id, r.id, { reviewOf: work.id });
  await adapter.assign(map.id, r.id, review.by);
  const at = start + 15 * MIN;
  journal.append(entry(map, r, at, claimOf(review.by)));
  const engine = { actor: 'teamtrail', actorKind: 'engine' as const };
  if (review.verdict === 'pass') {
    journal.append(entry(map, work, at + MIN, { ...engine, event: 'review.pass', from: 'verifying', to: 'done' }));
  } else {
    journal.append(entry(map, work, at + MIN, { ...engine, event: 'review.fail', from: 'verifying', to: 'rework' }));
  }
  if (review.verdict === 'overruled') {
    journal.append(
      entry(map, work, at + 2 * MIN, {
        event: 'accept',
        from: 'blocked',
        to: 'done',
        actor: 'trail lead',
        actorKind: 'trail lead',
      }),
    );
  }
  await adapter.close(map.id, r.id, 'completed');
}
