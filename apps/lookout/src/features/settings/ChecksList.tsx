import type { VerificationConfig } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { LEVEL_TEXT } from '../../lib/verification';

/** The checks as approved, read-only: where they're seen but not set (another device). */
export function ChecksList({ config: c, file, hash }: { config: VerificationConfig; file: string; hash?: string }) {
  return (
    <>
      <div className="sync-line ok" title={hash}>
        <span className="dot" />
        <span>
          <span className="t-code">{file}</span> · {c.run.length} checks run on every completion
        </span>
      </div>
      <MetaLine
        className="set-hint"
        parts={[
          `New trails start at ${LEVEL_TEXT[c.default]}`,
          `${c.maxAttempts} attempts before it waits for you`,
          c.failFast && 'Stops at the first failure',
        ]}
      />
      <div className="vf-checks">
        {Object.entries(c.checks).map(([name, spec]) => (
          <div key={name} className="vf-check">
            <span className="t-code">{c.run.includes(name) ? name : `${name} (on request)`}</span>
            <code>{spec.run.join(' ')}</code>
            <span className="dim">
              {spec.timeoutSec} s{spec.cwd && spec.cwd !== '.' ? ` · in ${spec.cwd}` : ''}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
