import type { CheckVariables } from '@teamtrail/core';
import { AddedVariableRow } from './AddedVariableRow';

/** The names checks get beyond the allowlist: added here (removable) and from TEAMTRAIL_CHECK_ENV (shell only). */
export function AddedNames(props: { view: CheckVariables; onRemove: (name: string) => void }) {
  const { added, fromShell } = props.view;
  if (!added.length && !fromShell.length) return null;
  return (
    <div className="cv-group">
      <span className="t-label">Added for this project</span>
      {added.map((n) => (
        <AddedVariableRow key={`s:${n}`} name={n} from="settings" onRemove={props.onRemove} />
      ))}
      {fromShell.map((n) => (
        <AddedVariableRow key={`e:${n}`} name={n} from="shell" />
      ))}
    </div>
  );
}
