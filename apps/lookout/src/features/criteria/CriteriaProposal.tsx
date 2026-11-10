import { Button, MetaLine } from '../../components/ui';
import type { CriteriaProposalView } from './useCriteriaProposals';

/**
 * An agent's proposed change to criteria you confirmed. Yours stay in force until you take it: completions are
 * checked against them.
 */
export function CriteriaProposal(props: {
  proposal: CriteriaProposalView;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { proposal: p } = props;
  return (
    <div className="crit-proposal edge-note edge-attention">
      <p className="t-meta">{p.by} proposes new criteria. Yours stay in force until you take these.</p>
      <ul className="item-list">
        {p.criteria.map((c) => (
          <li key={c.id}>
            <span className="item-text">{c.text}</span>
            <MetaLine parts={[{ text: c.id, code: true }, c.kind.replace('-', ' '), c.source && `from ${c.source}`]} />
          </li>
        ))}
      </ul>
      <div className="actions">
        <Button size="sm" variant="ghost" onClick={props.onDismiss}>
          Keep mine
        </Button>
        <Button size="sm" onClick={props.onAccept}>
          Take these
        </Button>
      </div>
    </div>
  );
}
