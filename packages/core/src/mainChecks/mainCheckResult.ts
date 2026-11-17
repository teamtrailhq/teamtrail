import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { MainCheckResult } from '../model/mainChecks';
import type { CheckResult } from '../model/verification';
import { checkPassed } from '../verification/runCheck';
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

/** A check result as a run on main keeps it, with its failure's signature; `folders` are the checkout's paths. */
export function mainCheckResult(root: string, c: CheckResult, folders: string[]): MainCheckResult {
  const passed = checkPassed(c);
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
    ...(passed ? {} : { signature: signatureOf(outputOf(root, c), folders) }),
  };
}
