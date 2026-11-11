import { BRAND } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';

async function sendCode(code: string): Promise<string | undefined> {
  const r = await fetch(`${BRAND.apiPrefix}/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (r.ok) return undefined;
  const reply = (await r.json().catch(() => ({}))) as { error?: string };
  return reply.error ?? 'That code didn’t work. Get a new one.';
}

/** A code typed from the Settings of the machine the Lookout runs on: "Pair a device". */
export function PairCodeForm() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    const failed = await sendCode(code).catch(() => 'The Lookout didn’t answer. Try again.');
    setBusy(false);
    setError(failed);
    if (!failed) location.reload();
  };
  return (
    <form
      className="pair-device"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="t-body pair-step">
        On a phone or another computer: in the Lookout on the machine {BRAND.name} runs on, open Settings → You →
        Browsers &amp; devices → Pair a device. Then type the code here, or scan it with this device’s camera.
      </p>
      <div className="pair-code-row">
        <input
          className="pair-code-input t-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-EFGH"
          aria-label="Pairing code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
        />
        <Button type="submit" variant="primary" disabled={busy || !code.trim()}>
          Pair
        </Button>
      </div>
      {error && (
        <p className="vf-err" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
