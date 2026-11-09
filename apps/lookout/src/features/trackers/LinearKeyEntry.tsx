import type { TrackerSettings } from '@teamtrail/core';
import { MetaLine } from '../../components/ui';
import { Credential } from './Credential';
import { keyFrom } from './linearText';

/** No key found (or another one wanted): paste a personal API key, and the teams it can access are listed below. */
export function LinearKeyEntry(props: { ln: TrackerSettings['linear']; apiKey: string; onKey: (k: string) => void }) {
  const { ln } = props;
  const refused =
    ln.auth && ln.viewer?.kind === 'unknown' ? `Found ${keyFrom(ln.auth)}, but Linear didn't accept it` : '';
  const why = ln.viewer?.kind === 'unknown' ? ln.viewer.error : '';
  return (
    <>
      {refused && <MetaLine parts={[refused, why]} />}
      <Credential
        source={null}
        value={props.apiKey}
        onChange={props.onKey}
        label="API key"
        placeholder="lin_api_…"
        link={{ href: 'https://linear.app/settings/account/security', text: 'New key' }}
      />
      <span className="t-meta">
        Or set <code className="t-code">LINEAR_API_KEY</code> before starting Teamtrail.
      </span>
    </>
  );
}
