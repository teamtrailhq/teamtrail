import { type AttentionItem } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { apiBase } from '../../lib/apiBase';

type Choice = 'as-is' | 'stricter';

/** Settles the settings someone else wrote into a tracked issue; the item's ref is `<issue id>:<tag>`. */
async function confirm(item: AttentionItem, choice: Choice): Promise<string | undefined> {
  const issueId = item.ref.slice(0, item.ref.lastIndexOf(':'));
  const r = await fetch(`${apiBase()}/trackers/settings/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId: item.mapId, issueId, choice }),
  });
  if (r.ok) return undefined;
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Saving failed (${r.status})`;
}

/**
 * The trail lead's one-click answer on a "settings changed in the tracker" row: take them as they are, or keep the
 * stricter of them and what applies now. Either one counts as accepted on this machine.
 */
export function TrackerSettingsAction({ item }: { item: AttentionItem }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = (choice: Choice) => {
    setBusy(true);
    setError(undefined);
    confirm(item, choice)
      .then(setError, (e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="att-action">
      <Button size="sm" disabled={busy} onClick={() => run('stricter')}>
        Keep stricter
      </Button>
      <Button size="sm" disabled={busy} onClick={() => run('as-is')}>
        Accept as is
      </Button>
      {error && <span className="vf-err">{error}</span>}
    </div>
  );
}
