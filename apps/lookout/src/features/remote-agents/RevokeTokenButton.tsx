import { useState } from 'react';
import { Button } from '../../components/ui';

/** "Revoke", asked once more: the agent holding the token is cut off within about a second and can't be let back in. */
export function RevokeTokenButton(props: { name: string; onRevoke: () => Promise<string | undefined> }) {
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
        <span className="t-meta">Its sessions end now.</span>
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
