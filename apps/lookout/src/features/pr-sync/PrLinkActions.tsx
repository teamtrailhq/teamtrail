import { useState } from 'react';
import { Button } from '../../components/ui';
import { setPrLink } from '../../lib';
import { useThisMachine } from '../settings/useThisMachine';
import { PrLinkPicker } from './PrLinkPicker';

/**
 * The trail lead's hand on the ticket's pull request, on the machine Teamtrail runs on only (it decides which PR this
 * machine posts the proof to): Link a different PR, or Unlink; with none linked, Link a pull request. Nothing on
 * another device.
 */
export function PrLinkActions(props: { mapId: string; ticketId: string; linked?: number }) {
  const { mapId, ticketId, linked } = props;
  const local = useThisMachine();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!local) return null;
  if (picking)
    return <PrLinkPicker mapId={mapId} ticketId={ticketId} linked={linked} onDone={() => setPicking(false)} />;
  const unlink = async () => {
    setBusy(true);
    setError(undefined);
    const failed = await setPrLink({ mapId, ticketId, pr: null });
    setBusy(false);
    if (failed) setError(failed);
  };
  return (
    <div className="pr-link-actions">
      <Button size="sm" variant="ghost" onClick={() => setPicking(true)} disabled={busy}>
        {linked ? 'Link a different PR' : 'Link a pull request'}
      </Button>
      {linked !== undefined && (
        <Button size="sm" variant="ghost" onClick={() => void unlink()} disabled={busy}>
          Unlink
        </Button>
      )}
      {error && (
        <span className="t-meta pr-link-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
