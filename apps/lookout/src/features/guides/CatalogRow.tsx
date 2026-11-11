import type { CatalogEntry } from '@teamtrail/core';
import { MetaLine, Row } from '../../components/ui';
import { catalogReviewPart } from './guideLabels';

/** One guide in the catalog list: what it is, who wrote it, whether the catalog's reviewers verified it. */
export function CatalogRow(props: { entry: CatalogEntry; catalogUrl: string; installed?: string; onOpen: () => void }) {
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
              catalogReviewPart(e, props.catalogUrl),
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
