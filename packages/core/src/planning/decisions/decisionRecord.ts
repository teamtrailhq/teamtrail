import type { DecisionSourceKind, DecisionRecord, DecisionStatus, DecisionInput } from '../../model/types';

/** Display names per source kind. A new integration adds its kind to `DecisionSourceKind` and a line here. */
export const DECISION_SOURCES: Record<DecisionSourceKind, { label: string; code: string }> = {
  lookout: { label: 'Lookout', code: 'CMD' },
  agent: { label: 'Agent', code: 'AGT' },
  slack: { label: 'Slack', code: 'SLK' },
  tracker: { label: 'Tracker', code: 'TRK' },
};

export const DECISION_SOURCE_KINDS = Object.keys(DECISION_SOURCES) as DecisionSourceKind[];

export const isSourceKind = (v: string): v is DecisionSourceKind => v in DECISION_SOURCES;

/**
 * Who made the call. Agents also record the human's HITL answers (`decidedBy: trail lead`), so the source alone
 * isn't enough: an agent decision is one an agent recorded and made itself. A record another tracker account
 * posted (`postedBy`) is that person's, whatever it says: never this machine's human, nor one of its agents.
 */
export function madeBy(d: Pick<DecisionRecord, 'decidedBy' | 'source' | 'postedBy'>): 'agent' | 'human' | 'teammate' {
  if (d.postedBy) return 'teammate';
  return d.source.kind === 'agent' && d.decidedBy !== 'trail lead' && !d.decidedBy.startsWith('slack:')
    ? 'agent'
    : 'human';
}

/** "posted by mona in GitHub", for a record another tracker account posted. */
export const postedNote = (d: Pick<DecisionRecord, 'postedBy' | 'postedIn'>) =>
  d.postedBy ? `posted by ${d.postedBy} in ${d.postedIn ?? 'the tracker'}` : undefined;

export const decisionStatus = (d: Pick<DecisionRecord, 'supersededBy'>): DecisionStatus =>
  d.supersededBy ? 'superseded' : 'active';

export function firstSentence(s: string) {
  const clean = s.replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.{20,180}?[.!?])(\s|$)/);
  return m ? m[1] : clean.slice(0, 180);
}

/** Fills defaults; shared by every adapter's `createDecision`. */
export function buildDecision(id: string, mapId: string, input: DecisionInput): DecisionRecord {
  return {
    ...input,
    id,
    mapId,
    decidedAt: input.decidedAt ?? Date.now(),
    summary: input.summary?.trim() || firstSentence(input.answer),
    alternatives: input.alternatives ?? [],
    rationale: input.rationale ?? '',
    participants: input.participants ?? [{ id: input.decidedBy }],
    transcript: input.transcript ?? [],
  };
}

export const decisionNumber = (id: string) => Number(id.replace(/\D/g, '')) || 0;

/** Oldest → newest records linked by `supersedes` / `supersededBy`, containing `id`. */
export function supersessionChain(all: DecisionRecord[], id: string): DecisionRecord[] {
  const byId = new Map(all.map((d) => [d.id, d]));
  const seen = new Set<string>();
  let head = byId.get(id);
  while (head?.supersedes && byId.has(head.supersedes) && !seen.has(head.id)) {
    seen.add(head.id);
    head = byId.get(head.supersedes);
  }
  const chain: DecisionRecord[] = [];
  seen.clear();
  for (let d = head; d && !seen.has(d.id); d = d.supersededBy ? byId.get(d.supersededBy) : undefined) {
    seen.add(d.id);
    chain.push(d);
  }
  return chain;
}
