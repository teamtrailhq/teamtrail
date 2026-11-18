import type { DiffRule } from '../model/diffRule';
import { globsOverlap } from '../workspaces/touches';

/**
 * The rules a claim will likely meet: those whose `when` globs can name a file the agent said it would change
 * (`touches`), each with the touches that overlap it. Told at the claim, so the agent plans for the check or the
 * question; what applies at completion is decided by the files that actually changed (matchRules.ts).
 */
export function rulesForTouches(rules: DiffRule[], touches: string[]): { rule: DiffRule; touches: string[] }[] {
  return rules
    .map((rule) => ({ rule, touches: touches.filter((t) => rule.when.some((g) => globsOverlap(g, t))) }))
    .filter((m) => m.touches.length > 0);
}
