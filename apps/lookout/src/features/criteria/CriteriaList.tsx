import type { Criterion } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';

/** Acceptance criteria, one line each, with the id, kind and source in a quiet meta line. */
export function CriteriaList({ criteria }: { criteria: Criterion[] }) {
  return (
    <ul className="criteria-list item-list">
      {criteria.map((c) => (
        <li key={c.id}>
          <span className="item-text">{c.text}</span>
          <MetaLine parts={[{ text: c.id, code: true }, c.kind.replace('-', ' '), c.source && `from ${c.source}`]} />
        </li>
      ))}
    </ul>
  );
}
