import { useState } from 'react';
import { SettingsSection } from '../settings/SettingsSection';
import { useThisMachine } from '../settings/useThisMachine';
import { useVerificationConfig } from '../settings/useVerificationConfig';
import { RulesEditor } from './RulesEditor';
import { RulesList } from './RulesList';
import { useRulesLastMatched } from './useRulesLastMatched';

/** Why the rules can't be set yet, or nothing when they can. */
function blocker(view: { exists: boolean; approval?: { waiting: boolean } }) {
  if (!view.exists) return 'Set the checks first: without them nothing is verified.';
  if (view.approval?.waiting) return 'Approve the checks first.';
  return undefined;
}

/**
 * Settings → Verification → Diff rules: checks to run or questions agents must answer when a change touches certain
 * files, each with why it exists. Set on the machine Teamtrail runs on (approved as they're saved), read elsewhere.
 */
export function RulesSection() {
  const { view } = useVerificationConfig();
  const local = useThisMachine();
  const lastMatched = useRulesLastMatched();
  const [saved, setSaved] = useState(false);
  if (!view) return null;
  const rules = view.config?.rules ?? [];
  const blocked = blocker(view);
  return (
    <SettingsSection title="Diff rules">
      <p className="vf-intro">
        When a change touches certain files, run a check or ask the agent a question it must answer before the ticket
        completes. Each rule says why it exists.
      </p>
      {local && !blocked && (
        <RulesEditor
          key={view.approval?.base ?? 'none'}
          view={view}
          lastMatched={lastMatched}
          saved={saved}
          onSaved={() => setSaved(true)}
        />
      )}
      {(!local || blocked) && rules.length > 0 && <RulesList rules={rules} lastMatched={lastMatched} />}
      {blocked && <span className="set-hint t-meta">{blocked}</span>}
      {local === false && <span className="set-hint t-meta">Set on the machine Teamtrail runs on.</span>}
    </SettingsSection>
  );
}
