import { type CatalogEntry as Entry } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { Button, MetaLine } from '../../components/ui';
import { AddGuideFlow } from './AddGuideFlow';
import { CatalogPreviewBody } from './CatalogPreviewBody';
import { ReportLink } from './ReportLink';
import type { CatalogPreview } from './types';

/**
 * One catalog guide in full before it's added: author, review history, what the safety lint found, the checklist,
 * the commands it proposes, and the whole instruction text the agent would read.
 */
export function CatalogEntry(props: {
  entry: Entry;
  installed?: string;
  preview: (id: string) => Promise<CatalogPreview>;
  add: (id: string) => Promise<{ pendingChecks: string[] }>;
  onBack: () => void;
}) {
  const e = props.entry;
  const [p, setP] = useState<CatalogPreview>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    props.preview(e.id).then(setP, (x: Error) => setError(x.message));
  }, [e.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="catalog-entry">
      <Button size="sm" variant="ghost" onClick={props.onBack}>
        ← All guides
      </Button>
      <h3 className="t-title">{e.name ?? e.id}</h3>
      <MetaLine
        parts={[
          { text: e.id, code: true },
          e.version,
          `by ${e.author}`,
          e.verified ? { text: 'Verified', strong: true } : 'Not reviewed',
          e.reviewedBy.length > 0 && `reviewed by ${e.reviewedBy.join(', ')}`,
        ]}
      />
      <p className="t-body">{e.summary}</p>
      {e.history.length > 0 && (
        <ul className="catalog-history">
          {e.history.map((h) => (
            <li key={`${h.version}-${h.commit}`} className="t-meta">
              {h.version} · <code className="t-code">{h.commit.slice(0, 8)}</code> · {h.at.slice(0, 10)}
              {h.reviewer && ` · reviewed by ${h.reviewer}`}
            </li>
          ))}
        </ul>
      )}
      {error && <span className="vf-err">{error}</span>}
      {p && <CatalogPreviewBody p={p} />}
      {p && <ReportLink repo={p.repo} id={e.id} version={e.version} />}
      {p && <AddGuideFlow preview={p} installed={props.installed} add={props.add} />}
    </div>
  );
}
