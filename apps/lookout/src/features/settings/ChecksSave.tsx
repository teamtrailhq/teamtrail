import { Button } from '../../components/ui';

/** Where a save stands: nothing yet, under way, done, or refused with the server's reason. */
export type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; text: string };

/**
 * The editor's footer, apart from the checks: the one question (saving approves the commands) and Save, the only
 * primary button, with how the last save went.
 */
export function ChecksSave(props: {
  sure: boolean;
  onSure: (sure: boolean) => void;
  state: SaveState;
  onSave: () => void;
}) {
  const { state } = props;
  const saving = state.kind === 'saving';
  return (
    <div className="vf-edit-foot">
      <label className="vf-edit-sure">
        <input type="checkbox" checked={props.sure} onChange={(e) => props.onSure(e.target.checked)} />
        <span>I know what these commands run, and approve them</span>
      </label>
      <div className="vf-edit-save">
        {state.kind === 'saved' && <span className="t-meta">Saved and approved.</span>}
        {state.kind === 'error' && <span className="vf-err">{state.text}</span>}
        <Button variant="primary" disabled={!props.sure || saving} onClick={props.onSave}>
          {saving ? 'Saving…' : 'Save checks'}
        </Button>
      </div>
    </div>
  );
}
