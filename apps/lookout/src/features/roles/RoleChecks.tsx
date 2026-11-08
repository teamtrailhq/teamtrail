import type { InstalledRole } from '@teamtrail/core';
import { Button } from '../../components/ui';
import { argvText } from './roleLabels';

/**
 * The checks a role requires and the commands it proposes, each as its exact argv. A proposed command only runs
 * once the trail lead approves it into verification.json; a changed argv needs approval again.
 */
export function RoleChecks(props: { r: InstalledRole; onApprove: (name: string) => void; busy?: boolean }) {
  const role = props.r.role;
  if (!role) return null;
  const proposed = Object.entries(role.proposedChecks);
  if (!role.requiresChecks.length && !proposed.length) return null;
  const canApprove = props.r.status === 'active';
  return (
    <div className="role-checks">
      {role.requiresChecks.length > 0 && (
        <span className="t-meta">
          Adds checks <code className="t-code">{role.requiresChecks.join(', ')}</code> to its tickets
        </span>
      )}
      {proposed.map(([name, spec]) => {
        const pending = props.r.pendingChecks.includes(name);
        return (
          <span key={name} className="role-check">
            <code className="t-code">
              {name}: {argvText(spec.run)}
            </code>
            {pending && canApprove && (
              <Button size="sm" disabled={props.busy} onClick={() => props.onApprove(name)}>
                Approve check {name}
              </Button>
            )}
            {pending && !canApprove && <span className="t-meta">approve the role first</span>}
            {!pending && <span className="t-meta">approved</span>}
          </span>
        );
      })}
    </div>
  );
}
