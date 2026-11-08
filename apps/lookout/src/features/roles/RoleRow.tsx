import type { InstalledRole } from '@teamtrail/core';
import { Button, MetaLine, Row } from '../../components/ui';
import { RoleChecks } from './RoleChecks';
import { sourceLabel, STATUS_TEXT } from './roleLabels';

/** One role in Settings → Roles: name and version, where it's from, its status and checks, and what to do. */
export function RoleRow(props: {
  r: InstalledRole;
  busy?: boolean;
  onAct: (path: string, body: Record<string, string>) => void;
}) {
  const { r } = props;
  const id = r.id;
  const needsYou = r.status !== 'active' || r.pendingChecks.length > 0;
  const approvable = (r.status === 'unapproved' || r.status === 'tampered') && !!r.role;
  const title = r.role ? `${r.role.name} ${r.role.version}` : id;
  return (
    <li className="role-row" data-role-id={id}>
      <Row
        edge={needsYou ? 'attention' : 'neutral'}
        title={title}
        context={
          <MetaLine
            parts={[
              { text: id, code: true },
              sourceLabel(r),
              r.status !== 'active' && STATUS_TEXT[r.status],
              r.role && `${r.role.checklist.length} checklist items`,
            ]}
          />
        }
        detail={r.reason ?? r.role?.summary}
        actions={
          r.origin === 'local' && (
            <Button
              size="sm"
              variant="ghost"
              disabled={props.busy}
              onClick={() => props.onAct('/roles/remove', { id })}
            >
              Remove role {id}
            </Button>
          )
        }
        below={
          <>
            {approvable && (
              <Button size="sm" disabled={props.busy} onClick={() => props.onAct('/roles/approve', { id })}>
                Approve role {id}
              </Button>
            )}
            <RoleChecks
              r={r}
              busy={props.busy}
              onApprove={(name) => props.onAct('/roles/checks/approve', { id, name })}
            />
          </>
        }
      />
    </li>
  );
}
