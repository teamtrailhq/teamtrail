import type { ChangedFile, EvidenceFlag } from '../model/evidence';
import type { VerificationConfig } from '../model/verification';
import { pathCovered } from './pathCovered';

const SHOWN = 5;
const EFFECT_TAIL = {
  fail: '; revert them, or claim again with touches that cover them and say why',
  human: '; a human decides',
} as const;

const list = (files: string[]) =>
  `${files.slice(0, SHOWN).join(', ')}${files.length > SHOWN ? `, and ${files.length - SHOWN} more` : ''}`;

/**
 * The scope flag of a completion that changed files: what changed outside the files the agent declared at its claim
 * (`touches`). Code nobody asked for is review work nobody planned, so the reviewer sees it before anything else. The
 * config's `scope` decides what it does: `flag` (a warning), `fail` (back to rework) or `human` (a person decides).
 * All changes inside the declared files are info; with none declared there is nothing to compare.
 */
export function scopeFlag(i: {
  changed: ChangedFile[];
  touches?: string[];
  scope: VerificationConfig['scope'];
}): EvidenceFlag | undefined {
  if (!i.changed.length) return undefined;
  const touches = i.touches ?? [];
  if (!touches.length) return undefined;
  const outside = i.changed.map((c) => c.path).filter((p) => !touches.some((g) => pathCovered(g, p)));
  if (!outside.length)
    return {
      kind: 'in-scope',
      level: 'info',
      message: `all ${i.changed.length} changed file${i.changed.length === 1 ? '' : 's'} inside the declared ${touches.join(', ')}`,
    };
  const effect = i.scope === 'flag' ? undefined : i.scope;
  const n = outside.length;
  return {
    kind: 'outside-scope',
    level: effect ? 'alert' : 'warn',
    message: `${n} changed file${n === 1 ? '' : 's'} outside the declared ${touches.join(', ')}: ${list(outside)}${effect ? EFFECT_TAIL[effect] : ''}`,
    files: outside,
    ...(effect ? { effect } : {}),
  };
}
