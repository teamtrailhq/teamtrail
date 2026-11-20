import { useState } from 'react';
import { InputRow } from '../../components/ui';
import { AddedNames } from './AddedNames';
import { AllowlistNames } from './AllowlistNames';
import { NeededVariableRow } from './NeededVariableRow';
import { SecretNameConfirm } from './SecretNameConfirm';
import { SettingsSection } from './SettingsSection';
import { useCheckVariables } from './useCheckVariables';
import { useThisMachine } from './useThisMachine';

/**
 * Settings → Project → Check variables: the variable names checks get beyond the allowlist, the names the repo's
 * tests seem to read and which of them checks wouldn't get. Names only: Teamtrail never stores or shows a value,
 * which always comes from the shell that started it. Kept and changed on the machine Teamtrail runs on only.
 */
export function CheckVariablesSection() {
  const local = useThisMachine();
  const { view, error, pending, change, cancel } = useCheckVariables();
  const [draft, setDraft] = useState('');
  if (local === false)
    return (
      <SettingsSection title="Check variables">
        <p className="set-hint t-meta">Seen and set on the machine Teamtrail runs on.</p>
      </SettingsSection>
    );
  if (!view) return null;
  const needed = view.needed.some((v) => v.name === pending?.name);
  const confirm = pending && (
    <SecretNameConfirm pending={pending} onConfirm={() => void add(pending.name, true)} onCancel={cancel} />
  );
  const add = (name: string, acknowledged?: boolean) =>
    change({ add: name, ...(acknowledged ? { acknowledged } : {}) }).then((ok) => ok && setDraft(''));
  return (
    <SettingsSection title="Check variables">
      <p className="vf-intro">
        Checks get only the variables named here from the shell that started Teamtrail. Teamtrail keeps the names, never
        a value: export the value in that shell before you start <code>teamtrail</code>, then add its name.
      </p>
      {view.needed.length > 0 && (
        <div className="cv-group">
          <span className="t-label">This repo&apos;s tests may read</span>
          {view.needed.map((v) => (
            <NeededVariableRow
              key={v.name}
              variable={v}
              onAllow={(name) => void add(name)}
              below={pending?.name === v.name && confirm}
            />
          ))}
        </div>
      )}
      <AddedNames view={view} onRemove={(name) => void change({ remove: name })} />
      <InputRow
        className="cv-add"
        aria-label="Variable name"
        placeholder="DATABASE_URL or APP_*"
        value={draft}
        onValueChange={setDraft}
        action="Add"
        onSubmit={(v) => void add(v.trim())}
      />
      {pending && !needed && confirm}
      {error && <span className="vf-err">{error}</span>}
      <AllowlistNames allowlist={view.allowlist} />
      <span className="set-hint t-meta">
        Anything a check can read, the code it runs can read too, and agents write that code: a test can print a value
        or send it anywhere. Give checks test values only, never production credentials.
      </span>
    </SettingsSection>
  );
}
