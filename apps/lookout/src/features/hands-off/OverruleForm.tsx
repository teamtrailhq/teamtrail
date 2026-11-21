import type { DecisionRecord } from '@teamtrail/core';
import { type FormEvent, useState } from 'react';
import { Button, Card, Field } from '../../components/ui';

/**
 * Overruling an agent's decision from the home: what else it weighed, then what it should be instead and why,
 * recorded as your decision replacing the agent's (both stay on record).
 */
export function OverruleForm(props: {
  d: DecisionRecord;
  onCancel: () => void;
  onOverrule: (input: { answer: string; rationale: string; alternatives: string[] }) => void;
}) {
  const { d } = props;
  const [answer, setAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    props.onOverrule({ answer: answer.trim(), rationale: rationale.trim(), alternatives: [d.summary || d.answer] });
  };
  return (
    <div className="home-review">
      {d.alternatives.length > 0 && <p className="t-meta">Alternatives considered: {d.alternatives.join(', ')}</p>}
      <Card as="form" tone="inset" className="inline-form" onSubmit={submit}>
        <Field label="What should it be instead?">
          <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
        </Field>
        <Field label="Why">
          <input value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </Field>
        <div className="form-actions">
          <Button variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!answer.trim()}>
            Overrule
          </Button>
        </div>
      </Card>
    </div>
  );
}
