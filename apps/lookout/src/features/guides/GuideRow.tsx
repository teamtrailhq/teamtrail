import type { InstalledGuide } from '@teamtrail/core';
import { Button, MetaLine, Row } from '../../components/ui';
import { GuideChecks } from './GuideChecks';
import { reviewPart, sourceLabel, STATUS_TEXT } from './guideLabels';

/** One guide in Settings → Guides: name and version, where it's from (and the catalog's review), its status and checks, and what to do. */
export function GuideRow(props: {
  r: InstalledGuide;
  busy?: boolean;
  onAct: (path: string, body: Record<string, string>) => void;
}) {
  const { r } = props;
  const id = r.id;
  const needsYou = r.status !== 'active' || r.pendingChecks.length > 0;
  const approvable = (r.status === 'unapproved' || r.status === 'tampered') && !!r.guide;
  const title = r.guide ? `${r.guide.name} ${r.guide.version}` : id;
  return (
    <li className="guide-row" data-guide-id={id}>
      <Row
        edge={needsYou ? 'attention' : 'neutral'}
        title={title}
        context={
          <MetaLine
            parts={[
              { text: id, code: true },
              sourceLabel(r),
              reviewPart(r),
              r.status !== 'active' && STATUS_TEXT[r.status],
              r.guide && checklistCount(r.guide.checklist.length),
            ]}
          />
        }
        detail={r.reason ?? r.guide?.summary}
        actions={
          r.origin === 'local' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={props.busy}
              onClick={() => props.onAct('/guides/remove', { id })}
            >
              Remove guide {id}
            </Button>
          )
        }
        below={
          <>
            {approvable && (
              <Button size="sm" disabled={props.busy} onClick={() => props.onAct('/guides/approve', { id })}>
                Approve guide {id}
              </Button>
            )}
            <GuideChecks
              r={r}
              busy={props.busy}
              onApprove={(name) => props.onAct('/guides/checks/approve', { id, name })}
            />
          </>
        }
      />
    </li>
  );
}

const checklistCount = (n: number) => (n === 1 ? '1 checklist item' : `${n} checklist items`);
