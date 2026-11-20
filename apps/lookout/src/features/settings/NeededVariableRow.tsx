import type { NeededVariable } from '@teamtrail/core';
import { Button, MetaLine, Row } from '../../components/ui';

/** What checks would get of a variable, in a few words: passed or not, and whether the shell has it. */
function stateOf(v: NeededVariable): string {
  if (!v.passes) return v.secretShaped ? 'Not passed: its name reads like a secret' : 'Not passed to checks';
  return v.set ? 'Checks get it' : "Checks may read it, but it isn't set in the shell that started Teamtrail";
}

/** A variable the repo's tests seem to read: where it was seen, what checks get, and the one action that changes it. */
export function NeededVariableRow(props: { variable: NeededVariable; onAllow?: (name: string) => void }) {
  const v = props.variable;
  const missing = !v.passes || !v.set;
  return (
    <Row
      edge={missing ? 'attention' : 'neutral'}
      title={<span className="t-code">{v.name}</span>}
      context={<MetaLine parts={[stateOf(v)]} />}
      detail={v.why}
      actions={
        !v.passes && props.onAllow ? (
          <Button size="sm" onClick={() => props.onAllow?.(v.name)}>
            Let checks read it
          </Button>
        ) : undefined
      }
    />
  );
}
