import type { DiscoveryBrief } from '@teamtrail/core';
import { type ReactNode, useEffect, useState } from 'react';
import { Button, ChangedNotice, Field, Panel } from '../../components/ui';
import { ago } from '../../lib';
import { BriefBody } from './BriefBody';

/** Review a discovery brief: every section, then Accept or Request changes (with a note the agent gets). */
export function BriefDialog(props: {
  brief: DiscoveryBrief;
  error?: string;
  /** The brief changed since the dialog opened: Accept waits for "Review again". */
  changed?: boolean;
  onReviewAgain?: () => void;
  /** The plan under the brief: every ticket's criteria, approved with it in one step (PlanApproval). */
  plan?: ReactNode;
  /** The plan is approved from `plan`: accepting the brief alone becomes the secondary choice. */
  planOffered?: boolean;
  onAccept: () => void;
  onRequestChanges: (note: string) => void;
  onClose: () => void;
}) {
  const { brief: b } = props;
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props]);
  return (
    <div className="scrim" onClick={props.onClose}>
      <Panel as="div" className="dialog brief-dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 className="t-heading caps">Discovery brief</h2>
          <span className="t-meta">{statusLine(b)}</span>
        </header>
        <BriefBody brief={b} />
        {props.plan}
        {asking && (
          <Field label="What should change?">
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          </Field>
        )}
        {props.changed && props.onReviewAgain && <ChangedNotice what="The brief" onReviewAgain={props.onReviewAgain} />}
        {props.error && <p className="urgent-text">{props.error}</p>}
        <div className="actions">
          {b.status === 'submitted' && !asking && (
            <>
              <Button onClick={() => setAsking(true)}>Request changes</Button>
              <Button
                variant={props.planOffered ? 'default' : 'primary'}
                disabled={props.changed}
                onClick={props.onAccept}
              >
                {props.planOffered ? 'Accept the brief only' : 'Accept brief'}
              </Button>
            </>
          )}
          {asking && (
            <>
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Back
              </Button>
              <Button variant="primary" disabled={!note.trim()} onClick={() => props.onRequestChanges(note.trim())}>
                Send to the agent
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={props.onClose}>
            Close
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/** "submitted · by claude-01 · 5m ago", or "Not submitted yet" for a draft. */
function statusLine(b: DiscoveryBrief) {
  if (b.status === 'draft') return 'Not submitted yet';
  const parts = [b.status.replace('-', ' ')];
  if (b.author) parts.push(`by ${b.author}`);
  if (b.submittedAt) parts.push(`${ago(Date.now() - b.submittedAt)} ago`);
  return parts.join(' · ');
}
