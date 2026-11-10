import type { KnowledgeEntry } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { Button, ChangedNotice, Field, MetaLine } from '../../components/ui';
import { useShown } from '../../hooks/useShown';
import { useKnowledge } from './knowledgeContext';

const STATUS_TEXT: Record<KnowledgeEntry['status'], string> = {
  suggested: 'Suggested by an agent. Not delivered to agents until you confirm it or keep it as an assumption.',
  confirmed: 'Confirmed: agents treat it as a fact.',
  assumption: 'Kept as an assumption: agents get it, marked as unverified.',
  outdated: 'Outdated: kept for history, never delivered.',
};

/** One entry: body, where it came from, and the trail lead's calls (confirm, assumption, outdated, resolve flag, edit). */
export function KnowledgeDetail({ e }: { e: KnowledgeEntry }) {
  const k = useKnowledge();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(e.title);
  const [body, setBody] = useState(e.body);
  useEffect(() => {
    setEditing(false);
    setTitle(e.title);
    setBody(e.body);
  }, [e.id, e.title, e.body]);
  const stale = k.stale[e.id];
  // Confirming binds to the entry as the trail lead opened it; an edit by an agent meanwhile waits for "Review again".
  const shown = useShown(e.id, k.hashes[e.id]);
  return (
    <div className="kn-detail">
      <MetaLine parts={[{ text: e.id, code: true }, e.kind.replace('-', ' '), e.status]} />
      {editing ? (
        <>
          <Field label="Title">
            <input value={title} onChange={(x) => setTitle(x.target.value)} />
          </Field>
          <Field label="Body">
            <textarea rows={8} value={body} onChange={(x) => setBody(x.target.value)} />
          </Field>
        </>
      ) : (
        <>
          <h3 className="t-title">{e.title}</h3>
          <p className="kn-body">{e.body}</p>
        </>
      )}
      <p className="dim">{STATUS_TEXT[e.status]}</p>
      {e.flag && (
        <p className="kn-warn">
          Flagged by {e.flag.by}: {e.flag.reason}
        </p>
      )}
      {stale && e.status !== 'outdated' && (
        <p className="kn-warn">
          May be outdated: {stale.join(', ')} changed since it was confirmed. Re-confirm or edit it.
        </p>
      )}
      <dl className="facts">
        {e.scope.length > 0 && (
          <>
            <dt>Applies to</dt>
            <dd>{e.scope.join(', ')}</dd>
          </>
        )}
        {e.tags.length > 0 && (
          <>
            <dt>Tags</dt>
            <dd>{e.tags.join(', ')}</dd>
          </>
        )}
        <dt>From</dt>
        <dd>{[e.createdBy, ...e.sources].join(' · ')}</dd>
        {e.anchors.length > 0 && (
          <>
            <dt>About files</dt>
            <dd>{e.anchors.map((a) => a.path).join(', ')}</dd>
          </>
        )}
      </dl>
      {shown.changed && <ChangedNotice what="This entry" onReviewAgain={shown.reviewAgain} />}
      {k.error && <p className="vf-err">{k.error}</p>}
      <div className="actions">
        {editing ? (
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!title.trim()}
              onClick={() => void k.call(e.id, { kind: 'edit', title, body }).then((ok) => ok && setEditing(false))}
            >
              Save
            </Button>
          </>
        ) : (
          <>
            {(e.status !== 'confirmed' || stale) && (
              <Button
                variant="primary"
                disabled={shown.changed}
                onClick={() => void k.call(e.id, { kind: 'confirm' }, shown.hash)}
              >
                {e.status === 'confirmed' ? 'Re-confirm' : 'Confirm'}
              </Button>
            )}
            {e.status !== 'assumption' && e.status !== 'outdated' && (
              <Button disabled={shown.changed} onClick={() => void k.call(e.id, { kind: 'assumption' }, shown.hash)}>
                Keep as assumption
              </Button>
            )}
            {e.flag && <Button onClick={() => void k.call(e.id, { kind: 'resolve-flag' })}>Resolve flag</Button>}
            <Button variant="ghost" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {e.status !== 'outdated' && (
              <Button variant="ghost" onClick={() => void k.call(e.id, { kind: 'outdated' })}>
                Mark outdated
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
