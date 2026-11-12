import type { SlackStatus } from '@teamtrail/connector-slack';
import { useEffect, useState } from 'react';
import { returnedLink } from './returnedLink';
import { slackApi } from './slackApi';

/**
 * Finishes Add Scout to Slack when the browser came back with a code: the server trades it, with the verifier it
 * kept, for this Teamtrail's link. Once per page load. Returns the error to show, if it failed.
 */
export function useConnectReturn(set: (s: SlackStatus) => void) {
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(!!returnedLink.code);
  useEffect(() => {
    const code = returnedLink.code;
    if (!code) return;
    returnedLink.code = undefined;
    slackApi
      .connectFinish(code)
      .then(set, (e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }, [set]);
  return { error, busy };
}
