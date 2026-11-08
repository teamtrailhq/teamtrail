import {
  DEFAULT_TIER_MAP,
  effectiveTiers,
  type AnsweredQuestion,
  type MapDoc,
  type MapSnapshot,
  type ModelMatching,
} from '@teamtrail/core';
import { Button } from '../../components/ui';
import { useModels } from '../models';
import { ModelsFileLine } from './ModelsFileLine';
import { SettingsSection } from './SettingsSection';
import { TierGrid } from './TierGrid';
import { useTypeHints } from './useTypeHints';

/**
 * Match work to models, per trail: each agent session gets the tickets set for the tier of the model it runs on.
 * The trail lead sets the policy here; Teamtrail never picks or switches a model. Changes apply to the next claim.
 */
export function ModelMatchingSection(props: {
  map?: MapDoc;
  snaps: MapSnapshot[];
  answered: AnsweredQuestion[];
  onChange: (value: ModelMatching) => void;
}) {
  const models = useModels();
  const hints = useTypeHints(props.snaps, props.answered);
  const map = props.map;
  if (!map) return null;
  const on = !!map.modelMatching?.enabled;
  const own = map.modelMatching?.tiers ?? {};
  return (
    <SettingsSection title="Model matching">
      <p className="vf-intro">
        Give each agent the tickets that fit the model it runs on: research to fast models, junctions, prototypes and
        reviews to the strongest. Teamtrail reads the model from the agent&apos;s log and never switches it. An agent
        can still claim any ticket by name, and tells you when it does.
      </p>
      <div className="att-settings-row set-field">
        <span className="set-field-label">Match work to models on trail {map.key}</span>
        <Button
          size="sm"
          on={on}
          aria-pressed={on}
          className="model-matching-toggle"
          onClick={() => props.onChange({ ...map.modelMatching, enabled: !on })}
        >
          {on ? 'On' : 'Off'}
        </Button>
      </div>
      {on && (
        <TierGrid
          tiers={effectiveTiers(map)}
          hints={hints}
          onChange={(type, tier) => {
            const tiers = { ...own, [type]: tier };
            if (tier === DEFAULT_TIER_MAP[type]) delete tiers[type];
            props.onChange({ enabled: true, tiers });
          }}
        />
      )}
      {on && <span className="set-hint t-meta">Changes apply to the next claim; nothing running is interrupted.</span>}
      <ModelsFileLine view={models} />
    </SettingsSection>
  );
}
