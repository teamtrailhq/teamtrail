import { useState } from 'react';
import { InputRow } from '../../components/ui';
import { AddedVariableRow } from './AddedVariableRow';
import { AllowlistNames } from './AllowlistNames';
import { NeededVariableRow } from './NeededVariableRow';
import { useCheckVariables } from './useCheckVariables';

/**
 * Settings → Verification → Variables checks can read: the variable names checks get beyond the allowlist, the names
 * the repo's tests seem to read and which of them checks wouldn't get. Names only: Teamtrail never stores or shows a
 * value, which always comes from the shell that started it. Set on the machine Teamtrail runs on.
 */
export function CheckVariablesSetting({ local }: { local?: boolean }) {
  const { view, error, change } = useCheckVariables();
  const [draft, setDraft] = useState('');
  if (local === false)
    return (
      <>
        <span className="set-field-label">Variables checks can read</span>
        <span className="set-hint t-meta">Seen and set on the machine Teamtrail runs on.</span>
      </>
    );
  if (!view) return null;
  const allow = (name: string) => void change({ add: name });
  const remove = (name: string) => void change({ remove: name });
  return (
    <div className="cv">
      <span className="set-field-label">Variables checks can read</span>
      <span className="set-hint t-meta">
        Checks get only the variables named here from the shell that started Teamtrail. Teamtrail keeps the names, never
        a value: export the value in that shell before you start <code>teamtrail</code>, then add its name.
      </span>
      {view.needed.length > 0 && (
        <div className="cv-group">
          <span className="t-label">This repo&apos;s tests may read</span>
          {view.needed.map((v) => (
            <NeededVariableRow key={v.name} variable={v} onAllow={allow} />
          ))}
        </div>
      )}
      {view.added.length + view.fromShell.length > 0 && (
        <div className="cv-group">
          <span className="t-label">Added for this project</span>
          {view.added.map((n) => (
            <AddedVariableRow key={`s:${n}`} name={n} from="settings" onRemove={remove} />
          ))}
          {view.fromShell.map((n) => (
            <AddedVariableRow key={`e:${n}`} name={n} from="shell" />
          ))}
        </div>
      )}
      <InputRow
        className="cv-add"
        aria-label="Variable name"
        placeholder="DATABASE_URL or APP_*"
        value={draft}
        onValueChange={setDraft}
        action="Add"
        onSubmit={(v) => void change({ add: v.trim() }).then((ok) => ok && setDraft(''))}
      />
      {error && <span className="vf-err">{error}</span>}
      <AllowlistNames allowlist={view.allowlist} />
      <span className="set-hint t-meta">
        Anything a check can read, the code it runs can read too, and agents write that code: a test can print a value
        or send it anywhere. Give checks test values only, never production credentials.
      </span>
    </div>
  );
}
