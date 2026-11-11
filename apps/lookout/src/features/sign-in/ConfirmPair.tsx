import { BRAND } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { sendPairCode } from './sendPairCode';

/**
 * A sign-in link was opened: it pairs this browser only on a click here, on the Lookout's own page, so no other
 * site can sign a browser in by sending it a link.
 */
export function ConfirmPair(props: { code: string; onFailed: (error: string) => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    const failed = await sendPairCode(props.code);
    if (!failed) return location.reload();
    setBusy(false);
    props.onFailed(failed);
  };
  return (
    <div className="pair-confirm">
      <p className="t-body pair-step">
        This link signs this browser in to the Lookout. Use it only if it came to you from{' '}
        <code className="t-code">{BRAND.slug}</code>, <code className="t-code">{BRAND.slug} pair</code> or Pair a device
        in the Lookout’s Settings.
      </p>
      <div>
        <Button variant="primary" disabled={busy} onClick={confirm}>
          Sign in this browser
        </Button>
      </div>
    </div>
  );
}
