import { useState } from 'react';
import { InputRow } from '../../components/ui';

/** Names an agent and creates its token. */
export function NewTokenForm(props: { onCreate: (name: string) => Promise<string | undefined> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (value: string) => {
    if (!value.trim() || busy) return;
    setBusy(true);
    const failed = await props.onCreate(value).catch((e: Error) => e.message);
    setBusy(false);
    setError(failed);
    if (!failed) setName('');
  };
  return (
    <div className="ra-new">
      <InputRow
        value={name}
        onValueChange={setName}
        onSubmit={submit}
        action="Create token"
        actionDisabled={busy || !name.trim()}
        placeholder="Name the agent, e.g. cloud sandbox 1"
        aria-label="Agent name"
        maxLength={60}
      />
      {error && <span className="vf-err">{error}</span>}
    </div>
  );
}
