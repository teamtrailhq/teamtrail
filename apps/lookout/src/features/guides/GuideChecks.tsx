import type { InstalledGuide } from '@teamtrail/core';
import { Button } from '../../components/ui';
import { argvText } from './guideLabels';

/**
 * The checks a guide requires and the commands it proposes, each as its exact argv. A proposed command only runs
 * once the trail lead approves it into verification.json; a changed argv needs approval again.
 */
export function GuideChecks(props: { r: InstalledGuide; onApprove: (name: string) => void; busy?: boolean }) {
  const guide = props.r.guide;
  if (!guide) return null;
  const proposed = Object.entries(guide.proposedChecks);
  if (!guide.requiresChecks.length && !proposed.length) return null;
  const canApprove = props.r.status === 'active';
  return (
    <div className="guide-checks">
      {guide.requiresChecks.length > 0 && (
        <span className="t-meta">
          Adds checks <code className="t-code">{guide.requiresChecks.join(', ')}</code> to its tickets
        </span>
      )}
      {proposed.map(([name, spec]) => {
        const pending = props.r.pendingChecks.includes(name);
        return (
          <span key={name} className="guide-check">
            <code className="t-code">
              {name}: {argvText(spec.run)}
            </code>
            {pending && canApprove && (
              <Button size="sm" disabled={props.busy} onClick={() => props.onApprove(name)}>
                Approve check {name}
              </Button>
            )}
            {pending && !canApprove && <span className="t-meta">approve the guide first</span>}
            {!pending && <span className="t-meta">approved</span>}
          </span>
        );
      })}
    </div>
  );
}
