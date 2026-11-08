import { ALL_TICKET_TYPES, DEFAULT_TIER_MAP, type ModelTier, type TicketType } from '@teamtrail/core';
import { MetaLine, Select } from '../../components/ui';
import { TYPE_TEXT } from '../../lib';
import { TIER_OPTIONS, TIER_TEXT } from '../../lib/modelTiers';

/** The tier each ticket type is set for, with the default when it's changed and what Trail stats measured. */
export function TierGrid(props: {
  tiers: Record<TicketType, ModelTier>;
  hints: Partial<Record<TicketType, string>>;
  onChange: (type: TicketType, tier: ModelTier) => void;
}) {
  return (
    <div className="tier-grid">
      {ALL_TICKET_TYPES.map((type) => {
        const tier = props.tiers[type];
        const def = DEFAULT_TIER_MAP[type];
        return (
          <div key={type} className="tier-row">
            <span>{TYPE_TEXT[type]}</span>
            <Select
              compact
              aria-label={`${TYPE_TEXT[type]} tickets' model`}
              className={`tier-select tier-${type}`}
              value={tier}
              options={TIER_OPTIONS}
              onChange={(next) => props.onChange(type, next)}
            />
            <MetaLine
              className="tier-hint"
              parts={[tier !== def && `default ${TIER_TEXT[def].toLowerCase()}`, props.hints[type]]}
            />
          </div>
        );
      })}
    </div>
  );
}
