import { pathsIn, selectKnowledge, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { Disclosure, Fact, MetaLine } from '../../components/ui';
import { useKnowledge } from './knowledgeContext';

/**
 * A fact in the inspector's How section: how many knowledge entries an agent gets when it claims this ticket, with the
 * entries and why each was picked behind Details. Nothing on a closed ticket or without entries.
 */
export function KnowledgePreview({ snap, t }: { snap: MapSnapshot; t: Ticket }) {
  const k = useKnowledge();
  if (!k.entries.length || t.state === 'closed') return null;
  const picked = selectKnowledge(
    k.entries,
    {
      trailKey: snap.map.key,
      ticket: { type: t.type, title: t.title, body: t.body },
      paths: pathsIn(`${t.body}\n${k.briefText}`),
    },
    4000,
    (e) => k.stale[e.id] ?? [],
  );
  const plural = picked.length === 1 ? 'entry' : 'entries';
  return (
    <Fact label="Knowledge">
      <span className="t-body">{picked.length ? `${picked.length} ${plural}` : 'None picked'}</span>
      {picked.length > 0 && (
        <Disclosure>
          <ul className="item-list">
            {picked.map((p) => (
              <li key={p.id}>
                <button className="item-text kn-open" onClick={() => k.setOpen(true)} data-tip={p.why.join(' · ')}>
                  {p.title}
                </button>
                <MetaLine
                  parts={[
                    { text: p.id, code: true },
                    p.status === 'assumption' && 'assumption',
                    p.mayBeOutdated && { text: 'may be outdated', className: 'warn' },
                  ]}
                />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </Fact>
  );
}
