import type { KnowledgeEntry } from '@teamtrail/core';

/**
 * The business rules in the field guide that no criterion covers yet, as one short hint: "No criterion covers
 * knowledge K-1 yet", each rule's title on hover rather than cut mid-sentence in the line.
 */
export function UncoveredRules({ rules }: { rules: Pick<KnowledgeEntry, 'id' | 'title'>[] }) {
  if (!rules.length) return null;
  return (
    <p className="t-meta crit-uncovered">
      No criterion covers knowledge{' '}
      {rules.map((r, i) => (
        <span key={r.id}>
          {i > 0 && ', '}
          <span className="t-code" data-tip={r.title}>
            {r.id}
          </span>
        </span>
      ))}{' '}
      yet
    </p>
  );
}
