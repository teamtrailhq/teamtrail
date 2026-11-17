import { Button } from '../../components/ui';
import type { EditedCheck } from './editedCheck';

/** Common checks, offered as one click each while there are none yet. */
const SUGGESTED: EditedCheck[] = [
  { name: 'test', command: 'npm test' },
  { name: 'lint', command: 'npm run lint' },
  { name: 'typecheck', command: 'npm run typecheck' },
];

/** Add check: a blank row to fill in, and, before there's any check, the common ones as one click each. */
export function ChecksAdd(props: { empty: boolean; onAdd: (check: EditedCheck) => void }) {
  return (
    <div className="vf-edit-add">
      <Button onClick={() => props.onAdd({ name: '', command: '' })}>Add check</Button>
      {props.empty && (
        <>
          <span className="t-meta">or start with</span>
          {SUGGESTED.map((s) => (
            <button key={s.name} type="button" className="chip t-code" onClick={() => props.onAdd(s)}>
              {s.command}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
