import { BRAND } from '@teamtrail/core';
import { useState } from 'react';
import { Button } from '../../components/ui';
import { ShownDeviceCode } from './ShownDeviceCode';
import type { DeviceCode } from './useSignIns';

/** "Pair a device": a short code for a phone or another computer on the network, single use, five minutes. */
export function PairDevicePanel(props: {
  lan: string[];
  device?: DeviceCode;
  onPair: () => Promise<string | undefined>;
  onDone: () => void;
}) {
  const [error, setError] = useState<string>();
  if (props.device) return <ShownDeviceCode device={props.device} onDone={props.onDone} />;
  if (!props.lan.length)
    return (
      <p className="t-meta si-note">
        This Lookout listens on this machine only, so no other device can reach it. To pair a phone or another computer,
        start it with <code className="t-code">{BRAND.slug} --host 0.0.0.0</code> on a network you trust. Another
        browser on this machine: run <code className="t-code">{BRAND.slug} pair</code>.
      </p>
    );
  return (
    <div className="si-pair">
      <Button onClick={async () => setError(await props.onPair())}>Pair a device</Button>
      {error && <span className="vf-err">{error}</span>}
    </div>
  );
}
