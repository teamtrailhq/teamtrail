import type { Proof } from '@teamtrail/core';
import { StatusMark } from '../../components/ui';
import { cx } from '../../lib';
import { proofLines } from './proofLines';

/**
 * A proof's checks, one line each: a square mark, the check's name, the command in mono and how long it took (or
 * how it failed), then the check guard and each review with the reviewer's model against the author's.
 */
export function ProofChecks({ proof }: { proof: Proof }) {
  const lines = proofLines(proof);
  if (!lines.length) return null;
  return (
    <ol className="proof-checks">
      {lines.map((l) => (
        <li key={l.key} className={cx('proof-check', `pc-${l.mark}`, l.holds && 'holds')}>
          <StatusMark kind={l.mark} />
          <span className="proof-check-name">{l.name}</span>
          <span className="proof-check-what">{l.what}</span>
          {l.meta && <span className="proof-check-meta">{l.meta}</span>}
        </li>
      ))}
    </ol>
  );
}
