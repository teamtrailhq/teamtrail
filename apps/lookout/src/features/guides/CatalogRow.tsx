import type { CatalogEntry } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';

/** One guide in the catalog list: what it is, who wrote it, whether the catalog's reviewers verified it. */
export function CatalogRow(props: { entry: CatalogEntry; installed?: string; onOpen: () => void }) {
  const e = props.entry;
  return (
    <li className="catalog-row" data-guide-id={e.id}>
      <Row
        title={e.name ?? e.id}
        context={
          <MetaLine
            parts={[
              { text: e.id, code: true },
              e.version,
              e.author,
              e.verified ? { text: 'Verified', strong: true } : 'Not reviewed',
              e.reported && 'Reported',
            ]}
          />
        }
        detail={e.summary}
        trailing={props.installed && `installed ${props.installed}`}
        onOpen={props.onOpen}
      />
    </li>
  );
}
