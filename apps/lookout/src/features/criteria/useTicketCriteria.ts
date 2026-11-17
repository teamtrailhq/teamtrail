import { pathsIn, selectKnowledge, uncoveredRules, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { useShown } from '../../hooks/useShown';
import { useKnowledge } from '../knowledge';
import { useCriteria } from './useCriteria';
import { useCriteriaProposals } from './useCriteriaProposals';

/**
 * One ticket's acceptance criteria, an agent's proposed change to them, and the business rules nothing covers yet,
 * with the trail lead's calls on them. Each call is bound to the version on screen (useShown): criteria or a
 * proposal rewritten while the human read wait for "Review again".
 */
export function useTicketCriteria(snap: MapSnapshot, t: Ticket) {
  const { tickets, confirm } = useCriteria(snap.map.id);
  const changes = useCriteriaProposals(snap.map.id);
  const proposal = changes.proposals.find((p) => p.ticketId === t.id);
  const k = useKnowledge();
  const entry = tickets.find((x) => x.ticketId === t.id);
  const criteria = entry?.criteria ?? [];
  const shown = useShown(t.id, entry?.hash);
  const proposalShown = useShown(proposal && `${proposal.ticketId}@${proposal.at}`, proposal?.hash);
  const rules = selectKnowledge(k.entries, {
    trailKey: snap.map.key,
    ticket: { type: t.type, title: t.title, body: t.body },
    paths: pathsIn(`${t.body}\n${k.briefText}`),
  }).filter((r) => r.kind === 'business-rule');
  const uncovered = rules.filter((r) => uncoveredRules(criteria, [r.id]).length);
  const decide = (action: 'accept' | 'dismiss') =>
    changes.decide(action, { title: snap.map.title, ticketId: t.id, hash: proposalShown.hash });
  return {
    criteria,
    confirmed: !!entry?.confirmed,
    proposal,
    uncovered,
    /** The criteria or the proposal changed since the human opened them: approving waits for "Review again". */
    changed: shown.changed ? shown : undefined,
    proposalChanged: proposal && proposalShown.changed ? proposalShown : undefined,
    setConfirmed: (confirmed: boolean) =>
      confirm({ title: snap.map.title, ticketId: t.id, ticketKey: t.key, confirmed, hash: shown.hash }),
    take: () => decide('accept'),
    keep: () => decide('dismiss'),
  };
}

export type TicketCriteria = ReturnType<typeof useTicketCriteria>;
