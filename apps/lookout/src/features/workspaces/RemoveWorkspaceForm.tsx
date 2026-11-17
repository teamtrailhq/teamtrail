import { Button, Card } from '../../components/ui';
import { RemoveWorkspaceButton } from './RemoveWorkspaceButton';
import type { RemoveOutcome, WorkspaceRow } from './useWorkspaces';

/** Asks before deleting a finished ticket's worktree folder: where it is, and that its branch stays. */
export function RemoveWorkspaceForm(props: {
  workspace: WorkspaceRow;
  onRemove: (force: boolean) => Promise<RemoveOutcome>;
  onCancel: () => void;
}) {
  const ws = props.workspace;
  return (
    <Card tone="inset" className="inline-form">
      <p className="t-body">
        Delete the worktree at{' '}
        <code className="t-code" title={ws.path}>
          {ws.path}
        </code>
        ? Branch <code className="t-code">{ws.branch}</code> stays.
      </p>
      <div className="form-actions">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <RemoveWorkspaceButton label="Remove workspace" onRemove={props.onRemove} />
      </div>
    </Card>
  );
}
