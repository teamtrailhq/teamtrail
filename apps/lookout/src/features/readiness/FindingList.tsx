import type { ReadinessFinding } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { FixArea } from './FixArea';
import { HowTo } from './HowTo';
import { findingContext, findingEdge } from './readinessText';
import type { ShownFix } from './useReadiness';

/** Every finding, blocking first: what's wrong, where, the evidence, and its fix or the commands to run yourself. */
export function FindingList(props: {
  findings: ReadinessFinding[];
  busy: boolean;
  onFix: (fixes: ShownFix[], acknowledged: boolean) => void;
}) {
  if (!props.findings.length) return null;
  return (
    <ul className="rd-list">
      {props.findings.map((f) => (
        <Row
          key={f.id}
          as="li"
          edge={findingEdge(f)}
          title={f.text}
          titleText={f.text}
          context={<MetaLine parts={findingContext(f)} />}
          detail={f.why}
          detailText={f.why}
          below={
            <>
              <FixArea finding={f} busy={props.busy} primary={f.level === 'blocks'} onFix={props.onFix} />
              <HowTo lines={f.howTo} />
            </>
          }
        />
      ))}
    </ul>
  );
}
