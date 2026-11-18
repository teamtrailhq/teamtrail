import { Select } from '../../components/ui';
import { sinceLabel } from '../../lib/sinceLabel';
import type { EditedRule } from './editedRule';

/**
 * One rule being edited: the files that trigger it, the check it runs and the question it asks, then why it exists;
 * a quiet remove at the end and when it last matched under it.
 */
export function RuleEditRow(props: {
  rule: EditedRule;
  checks: string[];
  lastMatched?: number;
  focus?: boolean;
  onChange: (patch: Partial<EditedRule>) => void;
  onRemove: () => void;
}) {
  const { rule, onChange } = props;
  const label = rule.id ? `Remove ${rule.id}` : 'Remove rule';
  const options = [{ value: '', label: 'No check' }, ...props.checks.map((c) => ({ value: c, label: `Run ${c}` }))];
  const matched = props.lastMatched ? `Last matched ${sinceLabel(props.lastMatched)}` : 'Not matched yet';
  return (
    <li className="dr-edit-rule">
      <div className="dr-edit-head">
        <span className="t-code dr-id">{rule.id ?? 'New'}</span>
        <input
          aria-label="When these files change"
          className="t-code"
          value={rule.when}
          placeholder="src/session/**, src/store.ts"
          autoFocus={props.focus}
          onChange={(e) => onChange({ when: e.target.value })}
        />
        <button
          type="button"
          className="icon-btn vf-edit-remove"
          aria-label={label}
          data-tip={label}
          onClick={props.onRemove}
        >
          ×
        </button>
      </div>
      <div className="dr-edit-body">
        <Select aria-label="Check" value={rule.check} options={options} onChange={(check) => onChange({ check })} />
        <input
          aria-label="Question"
          value={rule.ask}
          placeholder="Question the agent answers (optional)"
          onChange={(e) => onChange({ ask: e.target.value })}
        />
        <input
          aria-label="Why"
          value={rule.why}
          placeholder="Why: the incident behind it"
          onChange={(e) => onChange({ why: e.target.value })}
        />
        {rule.id && <span className="t-meta">{matched}</span>}
      </div>
    </li>
  );
}
