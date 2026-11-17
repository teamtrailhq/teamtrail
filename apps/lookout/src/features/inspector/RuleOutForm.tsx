import { useState, type FormEvent } from 'react';
import { Button, Card, Field } from '../../components/ui';

/** Moves the ticket out of scope with the trail lead's reason; it's set aside, not deleted. */
export function RuleOutForm(props: { onRuleOut: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState('Not needed to reach the destination.');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    props.onRuleOut(reason);
  };
  return (
    <Card as="form" tone="inset" className="inline-form" onSubmit={submit}>
      <Field label="Reason">
        <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      <div className="form-actions">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger">
          Rule out
        </Button>
      </div>
    </Card>
  );
}
