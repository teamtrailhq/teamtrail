import { Button } from '../../components/ui';

/** Revert for files nobody signed deletes them: asked once more, each file named, before anything is removed. */
export function DeleteConfirm(props: { files: string[]; busy: boolean; onDelete: () => void; onCancel: () => void }) {
  return (
    <div className="ap-below">
      <p className="t-meta">Delete {props.files.join(', ')}? Nobody signed them on this machine; git still has them.</p>
      <div className="ap-actions">
        <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onDelete}>
          Delete {props.files.length === 1 ? 'it' : `all ${props.files.length}`}
        </Button>
        <Button size="sm" disabled={props.busy} onClick={props.onCancel}>
          Keep
        </Button>
      </div>
    </div>
  );
}
