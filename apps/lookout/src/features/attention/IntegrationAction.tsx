import { type AttentionItem } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { apiBase } from '../../lib/apiBase';

/** Creates the suggested ticket that brings two clashing branches together. Nothing is merged. */
async function addIntegration(item: AttentionItem): Promise<string | undefined> {
  const [a, b] = item.ref.split('+');
  const r = await fetch(`${apiBase()}/workspaces/integration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapId: item.mapId, a, b }),
  });
  if (r.ok) return undefined;
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `Adding failed (${r.status})`;
}

/** The one-click trail lead action on an "integration" queue row: add a ticket, blocked by both, to bring them together. */
export function IntegrationAction({ item }: { item: AttentionItem }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const add = () => {
    setBusy(true);
    setError(undefined);
    addIntegration(item)
      .then(setError, (e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="att-action">
      <Button size="sm" className="integration-add" disabled={busy} onClick={add}>
        {busy ? 'Adding…' : 'Add integration ticket'}
      </Button>
      {error && <span className="vf-err">{error}</span>}
    </div>
  );
}
