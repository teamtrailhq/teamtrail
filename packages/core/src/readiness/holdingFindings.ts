import type { ReadinessChoice, ReadinessFinding, RepoReadiness } from '../model/readiness';

/** The blocking findings that hold this trail: every one the trail lead didn't start it anyway past. */
export function holdingFindings(readiness: RepoReadiness, choice?: ReadinessChoice): ReadinessFinding[] {
  const passed = new Set(choice?.findings ?? []);
  return readiness.findings.filter((f) => f.level === 'blocks' && !passed.has(f.id));
}
