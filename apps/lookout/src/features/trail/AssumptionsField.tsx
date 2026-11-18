import { TRAIL_TEXT_LIMITS, trailTextProblem } from '@teamtrail/core';
import { assumptionLines } from '../../lib/assumptionLines';
import { AssumptionsPreview } from './AssumptionsPreview';
import { DocField } from './DocField';

/** Past this many, a paste is more likely a document than a list of assumptions: the field says so. */
const MANY = 12;

/**
 * The assumptions a new trail starts with: one per line (a pasted list's bullets come off), each an `S-<n>` line of
 * the map. The count that will be created is always shown, so a pasted document never quietly becomes dozens.
 */
export function AssumptionsField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const lines = assumptionLines(value);
  const problem = trailTextProblem({ assumptions: lines });
  const L = TRAIL_TEXT_LIMITS;
  return (
    <DocField
      className="doc-assumptions"
      label="Assumptions"
      hint="Optional. One per line: each line is one assumption the plan relies on."
      value={value}
      onChange={onChange}
      max={L.assumptions * L.assumption}
      placeholder={'The v2 API supports batch writes\nUsers stay on one device per session'}
      preview={<AssumptionsPreview lines={lines} />}
      noFile
      footer={
        <>
          {lines.length > 0 && (
            <p className="t-meta doc-count" data-testid="assumption-count">
              {lines.length === 1 ? '1 assumption' : `${lines.length} assumptions`} will be created
              {lines.length > MANY && !problem ? ". That's a lot: if this is a document, put it in Notes." : '.'}
            </p>
          )}
          {problem && (
            <p className="vf-err" role="alert">
              {problem}
            </p>
          )}
        </>
      }
    />
  );
}
