import { type AttentionItem, webUrl } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { apiBase } from '../../lib/apiBase';

type Choice = 'retry' | 'discard';

/** Retries or discards the writes on a "tracker refused" row; its `mapId` and `ref` say which, as shown. */
async function settle(item: AttentionItem, action: Choice): Promise<string | undefined> {
  const r = await fetch(`${apiBase()}/trackers/refused`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, mapId: item.mapId, ref: item.ref }),
  });
  if (r.ok) return undefined;
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Saving failed (${r.status})`;
}

/**
 * The trail lead's answer on a write GitHub or Linear refused for good: send it again once access or the issue is
 * fixed, or forget it. The issue opens on the tracker when Teamtrail knows its page.
 */
export function RefusedWriteAction({ item }: { item: AttentionItem }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const url = webUrl(item.url);
  const run = (action: Choice) => {
    setBusy(true);
    setError(undefined);
    settle(item, action)
      .then(setError, (e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="att-action">
      <Button size="sm" disabled={busy} onClick={() => run('retry')}>
        Retry
      </Button>
      <Button size="sm" disabled={busy} onClick={() => run('discard')}>
        Discard
      </Button>
      {url && (
        <a className="t-meta" href={url} target="_blank" rel="noreferrer noopener">
          Open the issue
        </a>
      )}
      {error && <span className="vf-err">{error}</span>}
    </div>
  );
}
