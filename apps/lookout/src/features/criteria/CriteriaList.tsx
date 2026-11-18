import type { Criterion } from '@teamtrail/core';
import { MdText, MetaLine } from '../../components/ui';

/** Acceptance criteria, one line each (their inline markdown shown), with the id, kind and source in a quiet meta line. */
export function CriteriaList({ criteria }: { criteria: Criterion[] }) {
  return (
    <ul className="criteria-list item-list">
      {criteria.map((c) => (
        <li key={c.id}>
          <MdText className="item-text" text={c.text} />
          <MetaLine parts={[{ text: c.id, code: true }, c.kind.replace('-', ' '), c.source && `from ${c.source}`]} />
        </li>
      ))}
    </ul>
  );
}
