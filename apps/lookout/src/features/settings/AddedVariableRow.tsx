import { Button, Row } from '../../components/ui';

/** A name this machine's person let checks read, with Remove; the shell's own names can't be removed here. */
export function AddedVariableRow(props: {
  name: string;
  from: 'settings' | 'shell';
  onRemove?: (name: string) => void;
}) {
  const context = props.from === 'shell' ? 'In TEAMTRAIL_CHECK_ENV where Teamtrail started' : 'Added on this machine';
  return (
    <Row
      title={<span className="t-code">{props.name}</span>}
      context={<span className="t-meta">{context}</span>}
      actions={
        props.onRemove ? (
          <Button size="sm" onClick={() => props.onRemove?.(props.name)}>
            Remove
          </Button>
        ) : undefined
      }
    />
  );
}
