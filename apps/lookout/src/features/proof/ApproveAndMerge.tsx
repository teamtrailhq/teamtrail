import { Button } from '../../components/ui';
import { MergedNote } from './MergedNote';
import { useMergeRequest } from './useMergeRequest';

/** A done, verified ticket: Approve and merge, asked once, at exactly the commit Teamtrail verified. */
export function ApproveAndMerge(props: { path: string; mapId: string; ticketId: string }) {
  const m = useMergeRequest(props);
  const { state } = m;
  if (state.kind === 'merged') return <MergedNote url={state.url} />;
  if (state.kind === 'confirm')
    return (
      <div className="merge-confirm">
        <span className="t-meta">Merge its pull request, at exactly the commit Teamtrail verified?</span>
        <Button size="sm" onClick={() => void m.merge()}>
          Merge
        </Button>
        <Button size="sm" variant="ghost" onClick={m.cancel}>
          Cancel
        </Button>
      </div>
    );
  return (
    <div className="merge-confirm">
      <Button size="sm" disabled={state.kind === 'working'} onClick={m.ask}>
        {state.kind === 'working' ? 'Merging…' : 'Approve and merge'}
      </Button>
      {state.kind === 'error' && <span className="t-meta">{state.text}</span>}
    </div>
  );
}
