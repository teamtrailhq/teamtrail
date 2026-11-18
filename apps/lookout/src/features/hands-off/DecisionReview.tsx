import type { AuditDecision, DecisionRecord } from '@teamtrail/core';
import { type FormEvent, useState } from 'react';
import { Button, Card, Field } from '../../components/ui';

/**
 * Reviewing an agent's decision from the home: why it chose this and what else it weighed, then Keep it, or Overrule:
 * what it should be instead, recorded as your decision replacing the agent's (both stay on record). Overrule needs
 * the decision's record (`audit`), as the Logbook's Supersede does.
 */
export function DecisionReview(props: {
  d: DecisionRecord;
  audit?: AuditDecision;
  onKeep: () => void;
  onOverrule: (input: { answer: string; rationale: string; alternatives: string[] }) => void;
}) {
  const { d } = props;
  const [overruling, setOverruling] = useState(false);
  const [answer, setAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    props.onOverrule({ answer: answer.trim(), rationale: rationale.trim(), alternatives: [d.summary || d.answer] });
  };
  return (
    <div className="home-review">
      <p className="t-body">{d.rationale || d.answer}</p>
      {d.alternatives.length > 0 && <p className="t-meta">Alternatives considered: {d.alternatives.join(', ')}</p>}
      {overruling ? (
        <Card as="form" tone="inset" className="inline-form" onSubmit={submit}>
          <Field label="What should it be instead?">
            <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
          </Field>
          <Field label="Why">
            <input value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </Field>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setOverruling(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!answer.trim()}>
              Overrule
            </Button>
          </div>
        </Card>
      ) : (
        <div className="home-need-links">
          <Button onClick={props.onKeep}>Keep it</Button>
          {props.audit && !props.audit.postedBy && <Button onClick={() => setOverruling(true)}>Overrule…</Button>}
        </div>
      )}
    </div>
  );
}
