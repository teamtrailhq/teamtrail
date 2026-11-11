import { useState } from 'react';
import { Button } from '../../components/ui';

/** "Revoke", asked once more: that browser is signed out at once and needs a new code to come back. */
export function RevokeSignInButton(props: { name: string; onRevoke: () => Promise<string | undefined> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const revoke = async () => {
    setBusy(true);
    setError(await props.onRevoke().catch((e: Error) => e.message));
    setBusy(false);
    setAsking(false);
  };
  if (asking)
    return (
      <span className="ra-revoke ask">
        <span className="t-meta">It’s signed out now.</span>
        <Button size="sm" disabled={busy} onClick={revoke}>
          Revoke {props.name}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
          Keep
        </Button>
      </span>
    );
  return (
    <span className="ra-revoke">
      <Button size="sm" aria-label={`Revoke ${props.name}`} onClick={() => setAsking(true)}>
        Revoke
      </Button>
      {error && <span className="vf-err">{error}</span>}
    </span>
  );
}
