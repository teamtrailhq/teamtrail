import type { GuardFinding } from '../model/checkGuard';
import type { CheckSpec } from '../model/verification';
import { checkInputFindings } from './checkInputFindings';
import { checkReach } from './checkReach';
import { testFindings } from './testFindings';
import type { GuardReaders } from './types';

/** Tracker and dependency folders: never what a check runs, as far as the guard is concerned. */
const IGNORED = /(^|\/)(node_modules|\.git)\//;

/**
 * Whether a completion changed what its approved checks run, or weakened the tests they run: one finding per file and
 * change, in a fixed order (each check's inputs in the order the checks run, then the tests). Pure apart from
 * reading files through `read`; the same repo and change always give the same findings.
 */
export async function checkGuardFindings(o: {
  checks: { name: string; spec: CheckSpec }[];
  /** The files the work changed, relative to the folder the checks' `cwd` is relative to. */
  changed: string[];
  read: GuardReaders;
}): Promise<GuardFinding[]> {
  const changed = [...new Set(o.changed)].filter((f) => !IGNORED.test(f)).sort();
  if (!changed.length) return [];
  const out: GuardFinding[] = [];
  const seen = new Set<string>();
  const add = (f: GuardFinding) => {
    const key = `${f.file}\0${f.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(f);
  };
  for (const c of o.checks) {
    const reach = await checkReach({ name: c.name, spec: c.spec, read: o.read, changed });
    (await checkInputFindings({ reach, changed, read: o.read })).forEach(add);
  }
  (await testFindings({ changed, read: o.read })).forEach(add);
  return out;
}
