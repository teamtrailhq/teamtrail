import type { CheckFinding } from '@teamtrail/core';
import { CheckFindingList } from '../check-screening';
import type { EditedCheck } from './editedCheck';

/**
 * One check being edited: its name, command and folder on one line, a quiet remove at the end, and what reading the
 * repo found about the command right under it, with the command that runs offered when it's known.
 */
export function CheckEditRow(props: {
  check: EditedCheck;
  findings: CheckFinding[];
  focus?: boolean;
  onChange: (patch: Partial<EditedCheck>) => void;
  onRemove: () => void;
}) {
  const { check, onChange } = props;
  const label = check.name.trim() ? `Remove ${check.name.trim()}` : 'Remove check';
  return (
    <li className="vf-edit-check">
      <div className="vf-edit-row">
        <input
          aria-label="Name"
          value={check.name}
          placeholder="name"
          autoFocus={props.focus}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <input
          aria-label="Command"
          className="t-code"
          value={check.command}
          placeholder="npm test"
          onChange={(e) => onChange({ command: e.target.value })}
        />
        <input
          aria-label="Folder"
          className="t-code"
          value={check.cwd}
          placeholder="top folder"
          onChange={(e) => onChange({ cwd: e.target.value })}
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
        <CheckFindingList findings={props.findings} onFix={(run) => onChange({ command: run.join(' ') })} />
      </div>
    </li>
  );
}
