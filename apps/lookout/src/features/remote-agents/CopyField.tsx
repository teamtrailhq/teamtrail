import { useState } from 'react';
import { Button } from '../../components/ui';

/** A value to take away (a token, a command): shown in full, wrapped, with a copy button. */
export function CopyField(props: { label: string; value: string; copyLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard?.writeText(props.value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setCopied(false),
    );
  return (
    <div className="ra-copy">
      <code className="ra-copy-value t-code" aria-label={props.label}>
        {props.value}
      </code>
      <Button size="sm" className="ra-copy-btn" onClick={copy}>
        {copied ? 'Copied' : (props.copyLabel ?? 'Copy')}
      </Button>
    </div>
  );
}
