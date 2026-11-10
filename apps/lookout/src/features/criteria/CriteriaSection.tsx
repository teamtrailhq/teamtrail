import { pathsIn, selectKnowledge, uncoveredRules, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { Button, MetaLine } from '../../components/ui';
import { useKnowledge } from '../knowledge';
import { CriteriaProposal } from './CriteriaProposal';
import { useCriteria } from './useCriteria';
import { useCriteriaProposals } from './useCriteriaProposals';

/** In the inspector: what "done" means for this ticket, the trail lead's confirm, and business rules nothing covers. */
export function CriteriaSection({ snap, t }: { snap: MapSnapshot; t: Ticket }) {
  const { tickets, confirm } = useCriteria(snap.map.id);
  const changes = useCriteriaProposals(snap.map.id);
  const proposal = changes.proposals.find((p) => p.ticketId === t.id);
  const decide = (action: 'accept' | 'dismiss') =>
    void changes.decide(action, { title: snap.map.title, ticketId: t.id, hash: proposal?.hash });
  const k = useKnowledge();
  const entry = tickets.find((x) => x.ticketId === t.id);
  const criteria = entry?.criteria ?? [];
  const rules = selectKnowledge(k.entries, {
    trailKey: snap.map.key,
    ticket: { type: t.type, title: t.title, body: t.body },
    paths: pathsIn(`${t.body}\n${k.briefText}`),
  }).filter((r) => r.kind === 'business-rule');
  const uncovered = rules.filter((r) => uncoveredRules(criteria, [r.id]).length);
  if (!criteria.length && !uncovered.length && !proposal) return null;
  return (
    <div className="criteria-section d-section">
      <span
        className="t-label"
        data-tip="Agreed before the work starts; each needs evidence before the ticket counts as done"
      >
        Acceptance criteria · {criteria.length}
        {entry?.confirmed && <span className="ok-text"> · confirmed by you</span>}
      </span>
      {criteria.length > 0 && (
        <ul className="criteria-list item-list">
          {criteria.map((c) => (
            <li key={c.id}>
              <span className="item-text">{c.text}</span>
              <MetaLine
                parts={[{ text: c.id, code: true }, c.kind.replace('-', ' '), c.source && `from ${c.source}`]}
              />
            </li>
          ))}
        </ul>
      )}
      {proposal && (
        <CriteriaProposal proposal={proposal} onAccept={() => decide('accept')} onDismiss={() => decide('dismiss')} />
      )}
      {uncovered.length > 0 && (
        <div className="crit-uncovered edge-note edge-attention">
          <p className="t-meta">No criterion covers these rules yet:</p>
          <ul className="item-list">
            {uncovered.map((r) => (
              <li key={r.id}>
                <span className="item-text">{r.title}</span>
                <MetaLine parts={[{ text: r.id, code: true }, 'business rule']} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {criteria.length > 0 && t.state === 'open' && (
        <Button
          size="sm"
          variant={entry?.confirmed ? 'ghost' : 'default'}
          data-tip={
            entry?.confirmed ? 'Take your confirmation back' : 'Agree that these criteria define done for this ticket'
          }
          onClick={() =>
            void confirm({
              title: snap.map.title,
              ticketId: t.id,
              ticketKey: t.key,
              confirmed: !entry?.confirmed,
              hash: entry?.hash,
            })
          }
        >
          {entry?.confirmed ? 'Unconfirm' : 'Confirm criteria'}
        </Button>
      )}
    </div>
  );
}
