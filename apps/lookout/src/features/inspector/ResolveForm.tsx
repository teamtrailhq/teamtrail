import { useState, type FormEvent } from 'react';
import { Button, Card, Field } from '../../components/ui';

/** The trail lead answers the ticket themselves: the resolution, why, and what else was considered. */
export function ResolveForm(props: {
  onResolve: (answer: string, extra: { rationale: string; alternatives: string[] }) => void;
  onCancel: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    const listed = alternatives
      .split('\n')
      .map((a) => a.trim())
      .filter(Boolean);
    props.onResolve(answer.trim(), { rationale: rationale.trim(), alternatives: listed });
  };
  return (
    <Card as="form" tone="inset" className="inline-form" onSubmit={submit}>
      <Field label="Resolution">
        <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} autoFocus />
      </Field>
      <Field label="Rationale">
        <input value={rationale} onChange={(e) => setRationale(e.target.value)} />
      </Field>
      <Field label="Alternatives considered">
        <textarea
          rows={2}
          value={alternatives}
          onChange={(e) => setAlternatives(e.target.value)}
          placeholder="One per line"
        />
      </Field>
      <div className="form-actions">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!answer.trim()}>
          Resolve
        </Button>
      </div>
    </Card>
  );
}
