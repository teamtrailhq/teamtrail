import type { TrustItem } from '@teamtrail/core';
import { useState } from 'react';
import { Button, MetaLine, Row } from '../../components/ui';
import { standingText } from './approvalCopy';
import { DeleteConfirm } from './DeleteConfirm';

const filesOf = (item: TrustItem) => item.files ?? (item.file ? [item.file] : []);

/**
 * A trail file changed outside Teamtrail (a ticket, a decision, the trail's settings, a trail's files nobody
 * signed): what changed, and the human's answers. Accept signs it as theirs on this machine; Revert writes the
 * signed values back, or, for files nobody signed, deletes them once confirmed by name; some can only be accepted.
 */
export function StateChangeRow(props: {
  item: TrustItem;
  busy: boolean;
  local: boolean;
  onAccept: () => void;
  /** `remove`: the files the human confirmed deleting. */
  onRevert: (remove?: string[]) => void;
}) {
  const { item } = props;
  const [confirming, setConfirming] = useState(false);
  const files = filesOf(item);
  const revert = item.revert ?? 'restore';
  return (
    <Row
      as="li"
      className="ap-row"
      edge="attention"
      title={item.title}
      context={<MetaLine parts={[standingText(item)]} />}
      detail={files.join(', ') || undefined}
      detailText={files.join(', ') || undefined}
      below={
        <div className="ap-below">
          <pre className="ap-lines t-code">{item.lines.join('\n')}</pre>
          {props.local && !confirming && (
            <div className="ap-below ap-actions">
              <Button size="sm" disabled={props.busy} onClick={props.onAccept}>
                Accept this change
              </Button>
              {revert !== 'none' && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={props.busy}
                  onClick={() => (revert === 'delete' ? setConfirming(true) : props.onRevert())}
                >
                  {revert === 'delete' ? 'Delete…' : 'Revert'}
                </Button>
              )}
            </div>
          )}
          {props.local && confirming && (
            <DeleteConfirm
              files={files}
              busy={props.busy}
              onDelete={() => (setConfirming(false), props.onRevert(files))}
              onCancel={() => setConfirming(false)}
            />
          )}
        </div>
      }
    />
  );
}
