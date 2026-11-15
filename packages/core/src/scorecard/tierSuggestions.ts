import type { ModelTier } from '../model/modelTier';
import type { Scorecard, ScorecardRow } from '../model/scorecard';
import type { TicketType } from '../model/types';
import { tierOfModel } from '../planning/matching/tierOfModel';
import { UNKNOWN_MODEL } from './agentScorecard';

/** A tier the scorecard suggests for one ticket type, with the numbers that say so. Never applied by itself. */
export interface TierSuggestion {
  type: TicketType;
  current: ModelTier;
  tier: ModelTier;
  /** The model whose results it rests on. */
  model: string;
  because: string;
}

const pct = (r: ScorecardRow) => `${Math.round(r.firstTimeRate * 100)}%`;
const line = (r: ScorecardRow, type: string) =>
  `${r.model} passes ${pct(r)} of your ${type} tickets first time (${r.tickets} tickets)`;

/** Better first-time rate first; on a tie, cheaper per verified ticket, then the name. */
function better(a: ScorecardRow, b: ScorecardRow) {
  return (
    b.firstTimeRate - a.firstTimeRate ||
    (a.costPerVerifiedUsd ?? Infinity) - (b.costPerVerifiedUsd ?? Infinity) ||
    a.key.localeCompare(b.key)
  );
}

/**
 * Per ticket type, the tier of the model that does best on it in this repo, when that differs from the trail's tier
 * for the type. Only models with enough tickets are compared, and at least two must be: one model alone proves
 * nothing about another. Deterministic, with the reason in plain words.
 */
export function tierSuggestions(o: {
  scorecard: Scorecard;
  tiers: Record<TicketType, ModelTier>;
  models?: Record<string, ModelTier>;
}): TierSuggestion[] {
  const types = [...new Set(o.scorecard.byTypeAndModel.map((r) => r.type ?? ''))].filter(Boolean).sort();
  return types.flatMap((type) => {
    const rows = o.scorecard.byTypeAndModel
      .filter((r) => r.type === type && r.enough && r.model !== UNKNOWN_MODEL)
      .sort(better);
    if (rows.length < 2 || rows[0].firstTimeRate === rows[1].firstTimeRate) return [];
    const best = rows[0];
    const tier = tierOfModel(best.model, o.models).tier;
    const current = o.tiers[type as TicketType];
    if (!current || tier === current) return [];
    const because = `${line(best, type)}; ${line(rows[1], type)}`;
    return [{ type: type as TicketType, current, tier, model: best.model ?? '', because }];
  });
}
