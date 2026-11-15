import { tierSuggestions, type ModelTier, type TicketType } from '@teamtrail/core';
import { Button } from '../../components/ui';
import { TYPE_TEXT } from '../../lib';
import { TIER_TEXT } from '../../lib/modelTiers';
import { useScorecard } from '../performance';

/**
 * Tiers the scorecard suggests for this trail, from how models did on this repo's own tickets, each with its numbers
 * and a button. Nothing changes until the trail lead takes one.
 */
export function TierSuggestions(props: {
  tiers: Record<TicketType, ModelTier>;
  models?: Record<string, ModelTier>;
  onTake: (type: TicketType, tier: ModelTier) => void;
}) {
  const scorecard = useScorecard();
  if (!scorecard) return null;
  const list = tierSuggestions({ scorecard, tiers: props.tiers, models: props.models });
  if (!list.length) return null;
  return (
    <ul className="tier-suggestions">
      {list.map((s) => (
        <li key={s.type}>
          <span>
            {TYPE_TEXT[s.type]}: {TIER_TEXT[s.tier].toLowerCase()} instead of {TIER_TEXT[s.current].toLowerCase()}
          </span>
          <span className="t-meta">{s.because}</span>
          <Button size="sm" variant="ghost" onClick={() => props.onTake(s.type, s.tier)}>
            Use {TIER_TEXT[s.tier].toLowerCase()}
          </Button>
        </li>
      ))}
    </ul>
  );
}
