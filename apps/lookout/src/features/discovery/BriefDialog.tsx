import { BRIEF_SECTION_LABEL, type BriefSections, type DiscoveryBrief } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { Button, ChangedNotice, Empty, Field, MetaLine, Panel } from '../../components/ui';
import { ago } from '../../lib';
import { PromoteButton } from '../knowledge';
import { BriefProse } from './BriefProse';

const PROSE: (keyof BriefSections)[] = [
  'summary',
  'productContext',
  'existing',
  'conventions',
  'dataModel',
  'api',
  'risks',
];

/** Review a discovery brief: every section, then Accept or Request changes (with a note the agent gets). */
export function BriefDialog(props: {
  brief: DiscoveryBrief;
  error?: string;
  /** The brief changed since the dialog opened: Accept waits for "Review again". */
  changed?: boolean;
  onReviewAgain?: () => void;
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
  const s = b.sections;
  const filled = PROSE.filter((k) => (s[k] as string).trim());
  const empty = PROSE.filter((k) => !(s[k] as string).trim());
  return (
    <div className="scrim" onClick={props.onClose}>
      <Panel as="div" className="dialog brief-dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2 className="t-heading caps">Discovery brief</h2>
          <span className="t-meta">{statusLine(b)}</span>
        </header>
        <div className="brief-body">
          {filled.map((k) => (
            <section key={k}>
              <h3 className="mono-label">{BRIEF_SECTION_LABEL[k]}</h3>
              <BriefProse text={s[k] as string} />
              {(k === 'conventions' || k === 'productContext') && (s[k] as string).trim() && (
                <PromoteButton
                  draft={() => ({
                    title: `${BRIEF_SECTION_LABEL[k]}: ${(s[k] as string).split('\n')[0].slice(0, 80)}`,
                    body: s[k] as string,
                    kind: k === 'conventions' ? 'convention' : 'business-rule',
                    sources: [`brief:${b.mapId}`],
                  })}
                />
              )}
            </section>
          ))}
          <section>
            <h3 className="mono-label">{BRIEF_SECTION_LABEL.assumptions}</h3>
            {s.assumptions.length ? (
              <ul className="item-list">
                {s.assumptions.map((a) => (
                  <li key={a.id}>
                    <span className="item-text">{a.text}</span>
                    <MetaLine parts={[{ text: a.id, code: true }]} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>None listed</Empty>
            )}
          </section>
          <section>
            <h3 className="mono-label">{BRIEF_SECTION_LABEL.openQuestions}</h3>
            {s.openQuestions.length ? (
              <ul className="brief-list">
                {s.openQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            ) : (
              <Empty>None</Empty>
            )}
          </section>
          {empty.length > 0 && (
            <p className="t-meta brief-empty">
              Nothing noted on {empty.map((k) => BRIEF_SECTION_LABEL[k].toLowerCase()).join(', ')}.
            </p>
          )}
          {b.note && (
            <section>
              <h3 className="mono-label">Your last request</h3>
              <p>{b.note}</p>
            </section>
          )}
        </div>
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
              <Button variant="primary" disabled={props.changed} onClick={props.onAccept}>
                Accept brief
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
