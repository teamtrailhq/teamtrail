import type { SlackConnectPreview, SlackStatus } from '@teamtrail/connector-slack';
import { useEffect, useState } from 'react';
import { returnedLink } from './returnedLink';
import { slackApi } from './slackApi';

export interface ConnectReturn {
  /** Asking the server who the code belongs to, or connecting. */
  busy: boolean;
  error?: string;
  /** Who the code belongs to, waiting for the trail lead's Connect or Cancel. */
  confirm?: SlackConnectPreview;
  connect: () => void;
  cancel: () => void;
}

/**
 * The browser came back from Add Scout to Slack with a code. Nothing is saved until the trail lead has seen whose
 * it is: the server asks the service, with the verifier it kept, and the page asks "Connect as @user in
 * <workspace>?". Connect trades the code for this Teamtrail's link; Cancel drops the verifier. Once per page load.
 */
export function useConnectReturn(set: (s: SlackStatus) => void): ConnectReturn {
  const [code, setCode] = useState<string>();
  const [confirm, setConfirm] = useState<SlackConnectPreview>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(!!returnedLink.code);
  const failed = (e: Error) => setError(e.message);
  useEffect(() => {
    const taken = returnedLink.code;
    if (!taken) return;
    returnedLink.code = undefined;
    setCode(taken);
    slackApi
      .connectPreview(taken)
      .then(setConfirm, failed)
      .finally(() => setBusy(false));
  }, []);
  const settle = (p: Promise<SlackStatus>) => {
    setBusy(true);
    setConfirm(undefined);
    p.then(set, failed).finally(() => setBusy(false));
  };
  return {
    busy,
    error,
    confirm,
    connect: () => code && settle(slackApi.connectFinish(code)),
    cancel: () => settle(slackApi.connectCancel()),
  };
}
