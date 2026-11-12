import type { DecisionRecord, Comment } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { actorLabel } from '../../lib';
import { useSlackPeople } from '../slack';

/** The ticket's resolution (or rule-out) comment, with a link to its decision and the chain length. */
export function ResolutionNote({
  resolution,
  decisions,
  onOpenDecision,
}: {
  resolution: Comment;
  decisions: DecisionRecord[];
  onOpenDecision?: (id: string) => void;
}) {
  const people = useSlackPeople();
  const decision = decisions.find((d) => !d.supersededBy) ?? decisions[0];
  const kind = resolution.body.startsWith('**Ruled') ? 'ruled out' : 'resolution';
  const chain = decisions.length > 1 ? ` · ${decisions.length} in chain` : '';
  return (
    <div className="resolution edge-note edge-done">
      <div className="edge-note-head">
        <MetaLine parts={[{ text: actorLabel(resolution.author, people), strong: true }, kind]} />
        {decision && onOpenDecision && (
          <button className="link t-meta" onClick={() => onOpenDecision(decision.id)}>
            {decision.id}
            {chain} ›
          </button>
        )}
      </div>
      <p>{resolution.body.replace(/^\*\*[^*]+\*\*\s*/, '')}</p>
    </div>
  );
}
