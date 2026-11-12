import type { VerificationAttempt } from '../model/verification';

/**
 * The files an attempt touched, as far as anyone can tell: what git saw change (local completions) and what the
 * agent declared (the only thing a remote completion has). `undeclared` are files git saw that the agent left out.
 */
export function touchedBy(a: VerificationAttempt) {
  const changed = (a.git?.changed ?? []).map((f) => f.path);
  const declared = a.declaredPaths ?? [];
  const undeclared = a.declaredPaths ? changed.filter((p) => !declared.includes(p)) : [];
  return { all: [...new Set([...changed, ...declared])], undeclared };
}
