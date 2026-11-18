import { scorecardMarkdown } from '@teamtrail/core';
import { useState } from 'react';
import { Button, Choice, Label } from '../../components/ui';
import { CameBack } from './CameBack';
import { ScoreRows } from './ScoreRows';
import { useScorecard } from './useScorecard';

type Group = 'byTypeAndModel' | 'byType' | 'byModel' | 'byVendor' | 'byAgent' | 'byGuide' | 'cameBack';
const GROUPS: { id: Group; title: string }[] = [
  { id: 'byTypeAndModel', title: 'Type × model' },
  { id: 'byType', title: 'By type' },
  { id: 'byModel', title: 'By model' },
  { id: 'byVendor', title: 'By vendor' },
  { id: 'byAgent', title: 'By agent' },
  { id: 'byGuide', title: 'By guide' },
  { id: 'cameBack', title: 'Came back' },
];

/** Trail stats → Scorecard: verified first time, rework and cost per verified ticket on this repo, by ticket type and model. */
export function ScorecardSection() {
  const card = useScorecard();
  const [group, setGroup] = useState<Group>('byTypeAndModel');
  const [copied, setCopied] = useState(false);
  if (card === undefined || card === null) return null;
  const copy = () =>
    void navigator.clipboard.writeText(scorecardMarkdown(card)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <section className="perf-section scorecard">
      <div className="score-head">
        <Label as="h3">Scorecard</Label>
        <Button size="sm" variant="ghost" onClick={copy} disabled={!card.tickets}>
          {copied ? 'Copied' : 'Copy as Markdown'}
        </Button>
      </div>
      <p className="perf-note t-meta">
        How each model and agent does on your own tickets, from the checks Teamtrail ran. A ticket counts for whoever
        made its first completion. Groups under {card.minSample} tickets show as too few and aren&apos;t compared. Came
        back: verified, then reopened or reverted on main.
      </p>
      <div className="choice-row compact">
        {GROUPS.map((g) => (
          <Choice key={g.id} on={group === g.id} title={g.title} onClick={() => setGroup(g.id)} />
        ))}
      </div>
      {group === 'cameBack' ? (
        <CameBack checks={card.byCheck ?? []} escapes={card.escapes ?? []} minSample={card.minSample} />
      ) : (
        <ScoreRows rows={card[group] ?? []} minSample={card.minSample} />
      )}
    </section>
  );
}
