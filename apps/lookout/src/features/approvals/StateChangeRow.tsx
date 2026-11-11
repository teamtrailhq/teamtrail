import type { TrustItem } from '@teamtrail/core';
import { Button, MetaLine, Row } from '../../components/ui';
import { standingText } from './approvalCopy';

/**
 * A trail file changed outside Teamtrail (a ticket, a decision, the trail's settings): each gate field old → new,
 * and the human's two answers. Accept signs it as theirs on this machine; Revert writes the signed values back.
 */
export function StateChangeRow(props: {
  item: TrustItem;
  busy: boolean;
  local: boolean;
  onAccept: () => void;
  onRevert: () => void;
}) {
  const { item } = props;
  return (
    <Row
      as="li"
      className="ap-row"
      edge="attention"
      title={item.title}
      context={<MetaLine parts={[standingText(item)]} />}
      detail={item.file}
      detailText={item.file}
      below={
        <div className="ap-below">
          <pre className="ap-lines t-code">{item.lines.join('\n')}</pre>
          {props.local && (
            <div className="ap-below ap-actions">
              <Button size="sm" disabled={props.busy} onClick={props.onAccept}>
                Accept this change
              </Button>
              <Button size="sm" variant="ghost" disabled={props.busy} onClick={props.onRevert}>
                Revert
              </Button>
            </div>
          )}
        </div>
      }
    />
  );
}
