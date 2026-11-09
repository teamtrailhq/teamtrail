import { useEffect, useRef, useState } from 'react';
import { afterPoll, afterStart, type SignInState } from './signInState';
import { trackerApi } from './trackerApi';

/**
 * Sign in with GitHub from the page: Start shows a code, then the bridge is asked every `interval` seconds until the
 * person approves it on GitHub (`onSignedIn`), declines, or the code expires. Leaving the page stops waiting.
 */
export function useGitHubSignIn(onSignedIn: () => Promise<void> | void) {
  const [state, setState] = useState<SignInState>({ kind: 'idle' });
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;
  const waiting = state.kind === 'code';

  useEffect(() => {
    if (state.kind !== 'code') return;
    let live = true;
    const t = setTimeout(
      () =>
        void trackerApi.githubSignIn.poll().then(
          async (r) => {
            if (!live) return;
            if (r.kind === 'signed-in') await signedIn.current();
            if (live) setState(afterPoll(state, r));
          },
          (e: Error) => live && setState({ kind: 'ended', reason: e.message }),
        ),
      Math.max(state.interval, 1) * 1000,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [state]);

  // Closing the setup while the code shows: the bridge stops waiting for it too.
  useEffect(() => {
    if (!waiting) return;
    return () => void trackerApi.githubSignIn.cancel().catch(() => {});
  }, [waiting]);

  return {
    state,
    start() {
      setState({ kind: 'starting' });
      trackerApi.githubSignIn.start().then(
        (r) => setState(afterStart(r)),
        (e: Error) => setState({ kind: 'ended', reason: e.message }),
      );
    },
    cancel() {
      setState({ kind: 'idle' });
    },
  };
}
