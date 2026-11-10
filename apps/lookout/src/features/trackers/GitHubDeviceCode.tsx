import { webUrl } from '@teamtrail/core';
import { useState } from 'react';
import { Button, Loading } from '../../components/ui';

/** The code step of Sign in with GitHub: the code to enter, a button that opens GitHub, and a calm wait. */
export function GitHubDeviceCode(props: { code: string; href: string; onCancel: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard?.writeText(props.code).then(
      () => setCopied(true),
      () => {},
    );
  return (
    <div className="gh-device">
      <span className="t-label">Enter this code on GitHub</span>
      <div className="gh-device-row">
        <code className="gh-device-code t-code" aria-label="Your code">
          {props.code}
        </code>
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="gh-device-row">
        <a className="btn primary" href={webUrl(props.href)} target="_blank" rel="noreferrer" onClick={copy}>
          Open GitHub
        </a>
        <Button size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
      <Loading label="Waiting for you to approve on GitHub…" />
    </div>
  );
}
