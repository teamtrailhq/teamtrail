import type { VerificationConfig } from '../model/verification';
import { checkInputFindings } from './checkInputFindings';
import { checkReach } from './checkReach';
import { prefixedSpecs } from './prefixedSpecs';
import type { GuardReaders } from './types';

/**
 * Which of these checks the changed files reach as the check guard reads them (checkInputFindings.ts): their scripts,
 * their tools' config, files they name, their `guards`. Such a check is about this change whatever its `paths` say.
 * A check the guard can't read is counted as reached: unread is never a reason to run less.
 */
export async function checksTouched(o: {
  config: VerificationConfig | undefined;
  checks: string[];
  changed: string[];
  read: GuardReaders;
  prefix?: string;
}): Promise<string[]> {
  const out: string[] = [];
  for (const c of prefixedSpecs(o)) {
    const found = await checkReach({ name: c.name, spec: c.spec, read: o.read, changed: o.changed })
      .then((reach) => checkInputFindings({ reach, changed: o.changed, read: o.read }))
      .then((f) => f.length > 0)
      .catch(() => true);
    if (found) out.push(c.name);
  }
  return out;
}
