import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Select } from '../../components/ui';
import type { ActionRequest, OperatorAction } from '../../lib/verification';

export type Reasoned = Extract<OperatorAction, 'accept' | 'rework' | 'unblock'>;

const FORM: Record<Reasoned, { label: string; submit: string; hint: string }> = {
  rework: { label: 'What to fix', submit: 'Send to rework', hint: 'Posted on the ticket for the next agent.' },
  accept: { label: 'Why accept', submit: 'Accept anyway', hint: 'Closes the ticket as done despite the checks.' },
  unblock: { label: 'Why', submit: 'Unblock', hint: 'Back to the queue without running checks.' },
};

const GUARDED_HINT = 'The pass counts although the work changed what its checks run. The proof says you accepted it.';

/** A trail lead override on a verifying or held ticket. Each needs a reason, which is kept as a verdict. */
export function ReasonForm(props: {
  kind: Reasoned;
  /** Accepting a pass the check guard held: the checks passed, the work changed what they run. */
  guarded?: boolean;
  onSubmit: (req: Omit<ActionRequest, 'mapId' | 'ticketId'>) => void;
  onCancel: () => void;
}) {
  const { kind } = props;
  const [reason, setReason] = useState('');
  const [to, setTo] = useState<'ready' | 'rework'>('rework');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    props.onSubmit({ action: kind, reason: reason.trim(), ...(kind === 'unblock' ? { to } : {}) });
  };
  return (
    <Card as="form" tone="inset" className="inline-form" onSubmit={submit}>
      <Field label={FORM[kind].label}>
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      {kind === 'unblock' && (
        <Field label="Back to">
          <Select<'ready' | 'rework'>
            aria-label="Back to"
            value={to}
            onChange={setTo}
            options={[
              { value: 'rework', label: 'Rework', hint: 'Keeps the feedback for the next agent.' },
              { value: 'ready', label: 'Ready', hint: 'Back in the queue as a fresh ticket.' },
            ]}
          />
        </Field>
      )}
      <span className="t-meta">{kind === 'accept' && props.guarded ? GUARDED_HINT : FORM[kind].hint}</span>
      <div className="form-actions">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant={kind === 'accept' ? 'danger' : 'primary'} disabled={!reason.trim()}>
          {FORM[kind].submit}
        </Button>
      </div>
    </Card>
  );
}
