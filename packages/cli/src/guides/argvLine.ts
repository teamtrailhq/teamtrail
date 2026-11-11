import type { ProposedCheck } from '@teamtrail/core';

/** A proposed check as the person approves it: its exact argv as JSON, then its folder and time limit if set. */
export function argvLine(spec: ProposedCheck): string {
  const cwd = spec.cwd ? ` in ${spec.cwd}` : '';
  const timeout = spec.timeoutSec ? ` (up to ${spec.timeoutSec}s)` : '';
  return `${JSON.stringify(spec.run)}${cwd}${timeout}`;
}
