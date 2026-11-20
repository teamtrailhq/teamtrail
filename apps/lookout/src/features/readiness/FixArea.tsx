import type { ReadinessFinding } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { fixLabel, fixLines, unknownPrograms } from './readinessText';
import type { ShownFix } from './useReadiness';

/**
 * A finding's one-click fix: exactly what it writes (each command and its folder), and the button that saves it to
 * verification.json and approves it on this machine in the same step. A program Teamtrail doesn't know needs the
 * person's word first, as in Settings → Verification.
 */
export function FixArea(props: {
  finding: ReadinessFinding;
  busy: boolean;
  primary?: boolean;
  onFix: (fixes: ShownFix[], acknowledged: boolean) => void;
}) {
  const { finding } = props;
  const [known, setKnown] = useState(false);
  if (!finding.fix || !finding.fixHash) return null;
  const lines = fixLines(finding.fix);
  const unknown = unknownPrograms(finding.fix);
  const waits = unknown.length > 0 && !known;
  const shown = { id: finding.id, hash: finding.fixHash };
  return (
    <div className="rd-fix">
      {lines.length > 0 && (
        <ul className="rd-fix-lines">
          {lines.map((l) => (
            <li key={l.name} className="t-meta">
              <span className="t-code">{l.name}</span>: <span className="t-code">{l.run}</span> in {l.cwd}
            </li>
          ))}
        </ul>
      )}
      {unknown.length > 0 && (
        <label className="rd-ack t-meta">
          <input type="checkbox" checked={known} onChange={(e) => setKnown(e.target.checked)} />I know what{' '}
          {unknown.join(', ')} runs
        </label>
      )}
      <Button
        size="sm"
        variant={props.primary ? 'primary' : 'default'}
        disabled={props.busy || waits}
        data-tip="Saved to verification.json and approved on this machine in one step"
        onClick={() => props.onFix([shown], known)}
      >
        {fixLabel(finding.fix)}
      </Button>
    </div>
  );
}
