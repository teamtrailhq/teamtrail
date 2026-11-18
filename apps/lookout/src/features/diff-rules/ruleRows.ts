import type { VerificationConfig } from '@teamtrail/core';
import type { EditedRule } from './editedRule';

/** The rules as the file has them, as rows to edit. */
export const ruleRows = (c?: VerificationConfig): EditedRule[] =>
  (c?.rules ?? []).map((r) => ({
    id: r.id,
    when: r.when.join(', '),
    check: r.check ?? '',
    ask: r.ask ?? '',
    why: r.why,
  }));

/** A row as the server takes it: globs split on commas, empty fields left out. */
export const ruleBody = (r: EditedRule) => ({
  ...(r.id ? { id: r.id } : {}),
  when: r.when
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean),
  ...(r.check ? { check: r.check } : {}),
  ...(r.ask.trim() ? { ask: r.ask.trim() } : {}),
  why: r.why.trim(),
});

/**
 * A new rule from the address bar, `?settings=rules&when=<comma-separated globs>&why=<text>`, as another view's
 * "add a rule?" links to it; undefined without `when`, or once a rule with those files is in `rows` (saved, the
 * editor opens again with it).
 */
export function prefilledRule(search: string, rows: EditedRule[]): EditedRule | undefined {
  const q = new URLSearchParams(search);
  const when = q.get('when')?.trim().slice(0, 1000);
  if (q.get('settings') !== 'rules' || !when) return undefined;
  const globs = ruleBody({ when, check: '', ask: '', why: '' }).when.join(',');
  if (rows.some((r) => ruleBody(r).when.join(',') === globs)) return undefined;
  return { when, check: '', ask: '', why: (q.get('why') ?? '').slice(0, 300) };
}
