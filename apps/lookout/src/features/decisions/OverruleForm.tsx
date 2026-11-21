import type { AuditDecision } from '@teamtrail/core';
import { type FormEvent, useState } from 'react';
import { Button, Card, Field } from '../../components/ui';

/**
 * Overrule an agent's call from the Logbook: what it should be instead, and why. Recorded as your decision replacing
 * the agent's (both stay on record), as the Hands-off home's Overrule and the detail's Supersede do.
 */
export function OverruleForm(props: {
  d: AuditDecision;
  onOverrule: (input: { answer: string; rationale: string; alternatives: string[] }) => void;
  onCancel: () => void;
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
    <Card as="form" tone="inset" className="inline-form dv-overrule" onSubmit={submit}>
      {d.alternatives.length > 0 && <p className="t-meta">Alternatives it weighed: {d.alternatives.join(', ')}</p>}
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
  );
}
