import { useState } from 'react';
import { Button } from '../../components/ui';
import { apiBase } from '../../lib/apiBase';

/**
 * Go without one rule's answer for this ticket: why, then Confirm. Journaled, said on the ticket and shown in its
 * proof as a gap; the rule's check, if it has one, still runs.
 */
export function WaiveRuleForm(props: { mapId: string; ticketId: string; rule: string; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    const res = await fetch(`${apiBase()}/verification/rules/waive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId: props.mapId, ticketId: props.ticketId, rule: props.rule, reason }),
    }).catch(() => undefined);
    setBusy(false);
    if (res?.ok) return props.onDone();
    const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setError(body?.error ?? "The server didn't answer.");
  };
  return (
    <form
      className="dr-waive"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        aria-label={`Why ${props.rule} can go unanswered`}
        value={reason}
        placeholder="Why it can go unanswered"
        autoFocus
        onChange={(e) => setReason(e.target.value)}
      />
      <Button type="submit" disabled={busy || !reason.trim()}>
        Go without {props.rule}
      </Button>
      {error && <span className="vf-err">{error}</span>}
    </form>
  );
}
