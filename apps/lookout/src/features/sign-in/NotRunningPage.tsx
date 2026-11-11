import { BRAND } from '@teamtrail/core';
import { useEffect } from 'react';
import { Panel, Wordmark } from '../../components/ui';
import { proveServer } from '../../lib/serverProof';

/**
 * The server at this address didn't prove it is this browser's Lookout: Teamtrail stopped, or something else took
 * its port. Nothing is sent to it; the page keeps asking for the proof (never the session) and reloads once the
 * Lookout is back.
 */
export function NotRunningPage() {
  useEffect(() => {
    const t = setInterval(() => void proveServer().then((s) => s !== 'failed' && location.reload()), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="pair-page">
      <Panel as="main" className="pair-card">
        <div className="onb-brand">
          <Wordmark className="onb-title" />
        </div>
        <h1 className="t-heading pair-title">{BRAND.name} isn’t running here</h1>
        <p className="t-body pair-step">
          Start it with <code className="t-code">{BRAND.slug}</code> on the machine it runs on. This page reconnects
          once the Lookout answers as itself; until then it sends nothing to this address.
        </p>
      </Panel>
    </div>
  );
}
