import { webUrl } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { managedSignIn } from '../../lib/managedSignIn';

type State =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'working' }
  | { kind: 'merged'; url?: string }
  | { kind: 'error'; text: string };

/**
 * Behind a server that merges pull requests (managedSignIn.ts `merge`): on a done, verified ticket, Approve and merge.
 * The server checks it all again (done, verified, the pull request's head still the verified commit, who may approve)
 * and merges only at that commit; this asks once, then says what happened. Nothing elsewhere.
 */
export function MergeOnApprove(props: { mapId: string; ticketId: string; verified: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const path = managedSignIn()?.merge;
  if (!path || !props.verified) return null;
  const merge = async () => {
    setState({ kind: 'working' });
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trail: props.mapId, ticket: props.ticketId }),
      });
      const body = (await res.json().catch(() => ({}))) as { merged?: boolean; url?: string; error?: string };
      if (res.ok && body.merged) return setState({ kind: 'merged', url: body.url ? webUrl(body.url) : undefined });
      setState({ kind: 'error', text: String(body.error ?? `The server answered ${res.status}.`).slice(0, 300) });
    } catch {
      setState({ kind: 'error', text: "The server didn't answer. Try again." });
    }
  };
  if (state.kind === 'merged')
    return (
      <span className="t-meta merge-note">
        Approved and merged at the verified commit.{' '}
        {state.url && (
          <a href={state.url} target="_blank" rel="noreferrer">
            See the pull request
          </a>
        )}
      </span>
    );
  if (state.kind === 'confirm')
    return (
      <div className="merge-confirm">
        <span className="t-meta">Merge its pull request, at exactly the commit Teamtrail verified?</span>
        <Button size="sm" onClick={() => void merge()}>
          Merge
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setState({ kind: 'idle' })}>
          Cancel
        </Button>
      </div>
    );
  return (
    <div className="merge-confirm">
      <Button size="sm" disabled={state.kind === 'working'} onClick={() => setState({ kind: 'confirm' })}>
        {state.kind === 'working' ? 'Merging…' : 'Approve and merge'}
      </Button>
      {state.kind === 'error' && <span className="t-meta">{state.text}</span>}
    </div>
  );
}
