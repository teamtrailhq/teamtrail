import { useState } from 'react';
import { Button } from '../../components/ui';
import { apiBase } from '../../lib/apiBase';
import type { VerificationConfigView } from '../settings/useVerificationConfig';
import type { EditedRule } from './editedRule';
import { RuleEditRow } from './RuleEditRow';
import { prefilledRule, ruleBody, ruleRows } from './ruleRows';

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; text: string };
const BLANK: EditedRule = { when: '', check: '', ask: '', why: '' };

/**
 * Add, edit and remove the diff rules, on the machine Teamtrail runs on. Saving writes verification.json and approves
 * it in the same step, only over the file as loaded (the server's setRules.ts checks every rule again). A link with
 * `?settings=rules&when=…&why=…` opens it with that rule ready to finish.
 */
export function RulesEditor(props: {
  view: VerificationConfigView;
  lastMatched: Record<string, number>;
  /** Saved since Settings opened: the editor opens again on the file it wrote, and says so. */
  saved: boolean;
  onSaved: () => void;
}) {
  const { view, lastMatched } = props;
  const [rows, setRows] = useState<EditedRule[]>(() => {
    const saved = ruleRows(view.config);
    const prefilled = prefilledRule(location.search, saved);
    return [...saved, ...(prefilled ? [prefilled] : [])];
  });
  const [added, setAdded] = useState(false);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const checks = Object.keys(view.config?.checks ?? {});
  const set = (i: number, patch: Partial<EditedRule>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = async () => {
    setState({ kind: 'saving' });
    const rules = rows.filter((r) => r.when.trim()).map(ruleBody);
    const res = await fetch(`${apiBase()}/verification/rules`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules, base: view.approval?.base ?? 'none' }),
    }).catch(() => undefined);
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (res?.ok) {
      setState({ kind: 'idle' });
      return props.onSaved();
    }
    setState({ kind: 'error', text: body?.error ?? "The server didn't answer." });
  };
  const saving = state.kind === 'saving';
  return (
    <div className="vf-editor dr-editor">
      {rows.length > 0 && (
        <ul className="vf-edit-list">
          {rows.map((r, i) => (
            <RuleEditRow
              key={r.id ?? `new-${i}`}
              rule={r}
              checks={checks}
              lastMatched={r.id ? lastMatched[r.id] : undefined}
              focus={added && i === rows.length - 1}
              onChange={(patch) => set(i, patch)}
              onRemove={() => setRows(rows.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}
      <div className="vf-edit-add">
        <Button
          onClick={() => {
            setAdded(true);
            setRows([...rows, BLANK]);
          }}
        >
          Add rule
        </Button>
      </div>
      <div className="vf-edit-foot">
        <span className="t-meta">Saving approves them on this machine.</span>
        <div className="vf-edit-save">
          {props.saved && state.kind === 'idle' && <span className="t-meta">Saved and approved.</span>}
          {state.kind === 'error' && <span className="vf-err">{state.text}</span>}
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save rules'}
          </Button>
        </div>
      </div>
    </div>
  );
}
