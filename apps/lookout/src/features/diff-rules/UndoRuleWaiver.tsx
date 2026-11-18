import { useState } from 'react';
import { Button } from '../../components/ui';
import { apiBase } from '../../lib/apiBase';

/** Undo of one "Go without": the rule asks again from the ticket's next completion on. Says why when refused. */
export function UndoRuleWaiver(props: { mapId: string; ticketId: string; rule: string; onDone: () => void }) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const undo = async () => {
    setBusy(true);
    setError(undefined);
    const res = await fetch(`${apiBase()}/verification/rules/waive/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId: props.mapId, ticketId: props.ticketId, rule: props.rule }),
    }).catch(() => undefined);
    setBusy(false);
    if (res?.ok) return props.onDone();
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setError(body?.error ?? "The server didn't answer.");
  };
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        aria-label={`Undo going without ${props.rule}`}
        data-tip="The rule asks again on the next completion"
        onClick={() => void undo()}
      >
        Undo
      </Button>
      {error && <span className="vf-err">{error}</span>}
    </>
  );
}
