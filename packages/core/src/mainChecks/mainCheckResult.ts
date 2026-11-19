import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { MainCheckResult } from '../model/mainChecks';
import type { CheckResult } from '../model/verification';
import { checkPassed } from '../verification/runCheck';
import { environmentCause } from './environmentCause';
import { signatureOf } from './failureSignature';

const MAX_LOG = 1_048_576;

/** A check's full log when it can be read, else its tail. */
export function outputOf(root: string, c: { log?: string; tail: string }): string {
  if (!c.log) return c.tail;
  try {
    const text = readFileSync(path.join(root, c.log), 'utf8');
    return text.length > MAX_LOG ? text.slice(-MAX_LOG) : text;
  } catch {
    return c.tail;
  }
}

/**
 * A check result as a run on main keeps it, with its failure's signature and, when the machine rather than main's
 * code made it fail, why (environmentCause.ts); `folders` are the checkout's paths, `installed` whether approved setup
 * steps installed the dependencies first.
 */
export function mainCheckResult(
  root: string,
  c: CheckResult,
  o: { folders: string[]; installed: boolean },
): MainCheckResult {
  const passed = checkPassed(c);
  const output = passed ? '' : outputOf(root, c);
  const environment = passed ? undefined : environmentCause({ ...c, output, installed: o.installed });
  return {
    name: c.name,
    argv: c.argv,
    passed,
    exitCode: c.exitCode,
    timedOut: c.timedOut,
    ...(c.error ? { error: c.error } : {}),
    durationMs: c.durationMs,
    tail: c.tail.split('\n').slice(-20).join('\n'),
    log: c.log,
    ...(passed ? {} : { signature: signatureOf(output, o.folders) }),
    ...(environment ? { environment } : {}),
  };
}
