import type { TrustItem } from '@teamtrail/core';
import { Button, MetaLine, Row } from '../../components/ui';
import { KIND_CAVEAT, KIND_EFFECT, standingText } from './approvalCopy';

/**
 * One thing waiting for approval: what it is, why it waits, and exactly what approving it approves. Content nobody
 * committed is shown whole, since an agent may have written all of it.
 */
export function TrustItemRow(props: { item: TrustItem; busy: boolean; local: boolean; onApprove: () => void }) {
  const { item } = props;
  const whole = item.committed === false;
  // guide catalogs keep their summary (each catalog with its host) above the file shown whole
  const summary = item.kind === 'catalogs' ? [...item.lines, ''] : [];
  const shown = whole ? [...summary, ...item.content.split('\n')] : item.lines;
  return (
    <Row
      as="li"
      className="ap-row"
      edge="attention"
      title={item.title}
      context={<MetaLine parts={[standingText(item)]} />}
      detail={KIND_EFFECT[item.kind]}
      detailText={KIND_EFFECT[item.kind]}
      below={
        <div className="ap-below">
          <pre className="ap-lines t-code">{shown.join('\n')}</pre>
          {KIND_CAVEAT[item.kind] && <p className="ap-note t-meta">{KIND_CAVEAT[item.kind]}</p>}
          {item.warnings.length > 0 && (
            <ul className="ap-warnings t-meta">
              {item.warnings.map((w) => (
                <li key={w}>Worth a look: {w}</li>
              ))}
            </ul>
          )}
          {props.local && (
            <Button size="sm" disabled={props.busy} onClick={props.onApprove}>
              Approve
            </Button>
          )}
        </div>
      }
    />
  );
}
