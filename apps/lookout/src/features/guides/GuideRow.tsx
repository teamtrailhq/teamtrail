import type { InstalledGuide } from '@teamtrail/core';
import { Button, MetaLine, Row } from '../../components/ui';
import { GuideChecks } from './GuideChecks';
import { reviewPart, sourceLabel, statusPart } from './guideLabels';
import { GuideReview } from './GuideReview';

const OVERRIDE_WAITS = 'A file in guides/ replaces this built-in once you approve it; until then the built-in is used';

/** What the row says under its title: a waiting override, why it isn't active, or what it does. */
function detailOf(r: InstalledGuide) {
  if (r.override) return OVERRIDE_WAITS;
  // "not approved yet" is already in the context line, so a new guide shows what it does
  if (r.status === 'unapproved') return r.guide?.summary;
  return r.reason ?? r.guide?.summary;
}

/**
 * One guide in Settings → Guides: name and version, where it's from (and the catalog's review), its status and checks,
 * and what to do. A guide waiting for approval (or a file waiting to replace a built-in) is shown whole first.
 */
export function GuideRow(props: {
  r: InstalledGuide;
  busy?: boolean;
  onAct: (path: string, body: Record<string, string>) => void;
}) {
  const { r } = props;
  const id = r.id;
  const waiting = r.override ?? r;
  const approvable = (waiting.status === 'unapproved' || waiting.status === 'tampered') && !!waiting.guide;
  const needsYou = r.status !== 'active' || r.pendingChecks.length > 0 || approvable;
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
              statusPart(r),
              r.guide && checklistCount(r.guide.checklist.length),
            ]}
          />
        }
        detail={detailOf(r)}
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
              <GuideReview
                r={waiting}
                busy={props.busy}
                onApprove={(sha256) => props.onAct('/guides/approve', { id, sha256 })}
              />
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
