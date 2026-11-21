import type { VerificationConfig } from '@teamtrail/core';
import { useState } from 'react';
import { Choice } from '../../components/ui';
import { apiBase } from '../../lib/apiBase';
import { useMarkSaved } from './useMarkSaved';
import type { VerificationConfigView } from './useVerificationConfig';

type Scope = VerificationConfig['scope'];

const OPTIONS: { value: Scope; title: string; sub: string }[] = [
  { value: 'flag', title: 'Show the reviewer', sub: 'The proof and the review list them first' },
  { value: 'fail', title: 'Send back', sub: 'The agent reverts them or says why it needs them' },
  { value: 'human', title: 'Ask me', sub: 'The ticket waits for you to decide' },
];

/**
 * What a completion that changed files outside the ones its agent declared at the claim does. Code nobody asked for is
 * review nobody planned. Set on the machine Teamtrail runs on (approved as it's saved), shown elsewhere.
 */
export function ScopeSetting({ view, local }: { view: VerificationConfigView; local?: boolean }) {
  const [error, setError] = useState<string>();
  const markSaved = useMarkSaved();
  const current = view.config?.scope ?? 'flag';
  const blocked = view.approval?.waiting ? 'Approve the checks first.' : undefined;
  const save = async (scope: Scope) => {
    setError(undefined);
    const res = await fetch(`${apiBase()}/verification/scope`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, base: view.approval?.base ?? 'none' }),
    }).catch(() => undefined);
    // approved and journaled under _trust with the write
    if (res?.ok) return markSaved(true);
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setError(body?.error ?? "The server didn't answer.");
  };
  return (
    <>
      <span className="set-field-label">Changes outside the files an agent declared</span>
      <div className="choice-row vf-levels">
        {OPTIONS.map((o) => (
          <Choice
            key={o.value}
            on={current === o.value}
            title={o.title}
            sub={o.sub}
            disabled={!local || !!blocked}
            onClick={() => void save(o.value)}
          />
        ))}
      </div>
      <span className="set-hint t-meta">
        Agents say which files they&apos;ll change when they claim a ticket. Anything they change beyond that is code
        nobody asked for.{blocked ? ` ${blocked}` : ''}
        {local === false ? ' Set on the machine Teamtrail runs on.' : ''}
      </span>
      {error && <span className="vf-err">{error}</span>}
    </>
  );
}
