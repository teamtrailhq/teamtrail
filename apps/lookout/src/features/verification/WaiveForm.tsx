import type { CheckResult, WaivableCheck } from '@teamtrail/core';
import { useState, type FormEvent } from 'react';
import { Button, Card, Disclosure, Field, MetaLine } from '../../components/ui';

/** How a failing check ended, in a few words. */
function ended(c?: CheckResult) {
  if (!c) return undefined;
  if (c.timedOut) return 'timed out';
  if (c.error) return `couldn't run: ${c.error}`;
  return `exited ${c.exitCode ?? c.signal}`;
}

/**
 * "Accept without <check>": for a check that can't pass in this repo. The trail lead picks the failing checks (all
 * by default) and says why; the other checks run again on the same work, and the proof shows each one skipped, by
 * them, with this reason. What failed is behind Details.
 */
export function WaiveForm(props: {
  waivable: WaivableCheck[];
  /** The latest completion's results, for what failed. */
  results: CheckResult[];
  onSubmit: (req: { checks: WaivableCheck[]; reason: string }) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState(() => new Set(props.waivable.map((c) => c.name)));
  const [reason, setReason] = useState('');
  const checks = props.waivable.filter((c) => picked.has(c.name));
  const names = checks.map((c) => c.name).join(', ');
  const ready = checks.length > 0 && !!reason.trim();
  const toggle = (name: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(name);
    else next.delete(name);
    setPicked(next);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) props.onSubmit({ checks, reason: reason.trim() });
  };
  return (
    <Card as="form" tone="inset" className="inline-form waive-form" onSubmit={submit}>
      {props.waivable.length > 1 && (
        <fieldset className="waive-checks">
          {props.waivable.map((c) => (
            <label key={c.name} className="waive-check t-body">
              <input type="checkbox" checked={picked.has(c.name)} onChange={(e) => toggle(c.name, e.target.checked)} />
              <code className="t-code">{c.name}</code>
            </label>
          ))}
        </fieldset>
      )}
      <Field label={`Why it can go without ${names || 'them'}`}>
        <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      <span className="t-meta">The other checks run again. The proof shows what was skipped, by you, and why.</span>
      <Disclosure label="What failed">
        {props.waivable.map((c) => (
          <MetaLine
            key={c.name}
            parts={[
              { text: c.name, code: true },
              { text: c.argv.join(' '), code: true },
              ended(props.results.find((r) => r.name === c.name)),
            ]}
          />
        ))}
      </Disclosure>
      <div className="form-actions">
        <Button variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!ready}>
          {checks.length ? `Accept without ${names}` : 'Pick a check'}
        </Button>
      </div>
    </Card>
  );
}
