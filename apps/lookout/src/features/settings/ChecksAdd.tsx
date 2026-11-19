import type { CheckSuggestion } from '@teamtrail/core';
import { Button } from '../../components/ui';
import type { EditedCheck } from './editedCheck';
import { SuggestionChip } from './SuggestionChip';

/**
 * Add check: a blank row to fill in, and the checks reading the repo suggests, each one click to add with its
 * folder. Adding only puts it in the list: it runs once saved, which is the approval.
 */
export function ChecksAdd(props: {
  suggestions: CheckSuggestion[];
  onAdd: (check: EditedCheck) => void;
  onSuggestion: (s: CheckSuggestion) => void;
}) {
  return (
    <div className="vf-edit-add">
      <Button onClick={() => props.onAdd({ name: '', command: '', cwd: '' })}>Add check</Button>
      {props.suggestions.length > 0 && <span className="t-meta">or add what this repo runs</span>}
      {props.suggestions.map((s) => (
        <SuggestionChip key={`${s.cwd}|${s.run.join(' ')}`} suggestion={s} onAdd={() => props.onSuggestion(s)} />
      ))}
    </div>
  );
}
