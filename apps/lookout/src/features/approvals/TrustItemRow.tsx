import type { TrustItem } from '@teamtrail/core';
import { Button, MetaLine, Row } from '../../components/ui';
import { settingsSectionLink } from '../../lib/settingsSectionLink';
import { CheckFindingList } from '../check-screening';
import { KIND_CAVEAT, KIND_EFFECT, shownWhole, standingText } from './approvalCopy';
import { ApprovalLines } from './ApprovalLines';

/**
 * One thing waiting for approval: what it is, why it waits, and exactly what approving it approves. Free text nobody
 * committed is shown whole, since an agent may have written all of it; check commands always show as their diff,
 * which names every command and setup step approving would run (a Cloud workspace has no git, so nothing there is
 * ever committed).
 */
export function TrustItemRow(props: { item: TrustItem; busy: boolean; local: boolean; onApprove: () => void }) {
  const { item } = props;
  const whole = shownWhole(item);
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
          <ApprovalLines lines={shown} whole={whole} />
          {KIND_CAVEAT[item.kind] && <p className="ap-note t-meta">{KIND_CAVEAT[item.kind]}</p>}
          {item.warnings.length > 0 && (
            <ul className="ap-warnings t-meta">
              {item.warnings.map((w) => (
                <li key={w}>Worth a look: {w}</li>
              ))}
            </ul>
          )}
          <CheckFindingList
            findings={item.screening ?? []}
            named
            action={props.local && <a {...settingsSectionLink('verification')}>Edit checks</a>}
          />
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
