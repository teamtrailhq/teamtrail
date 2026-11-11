import { type ReactNode, useEffect, useState } from 'react';
import { NotRunningPage } from './NotRunningPage';
import { PairPage } from './PairPage';
import { sendPairCode } from './sendPairCode';
import { takePairCode } from './takePairCode';
import { useSignInStatus } from './useSignInStatus';

/**
 * The Lookout once this browser is paired; "Pair this browser" until then. Nothing shows while it asks. A browser
 * already signed in that opens a sign-in link keeps its session: the link's code is spent, never used in its place.
 */
export function SignInGate({ children }: { children: ReactNode }) {
  const status = useSignInStatus();
  const [code, setCode] = useState(takePairCode);
  // A link pasted into a tab that already shows the Lookout only changes the fragment: take it from there too.
  useEffect(() => {
    const taken = () => setCode((was) => takePairCode() ?? was);
    window.addEventListener('hashchange', taken);
    return () => window.removeEventListener('hashchange', taken);
  }, []);
  useEffect(() => {
    if (status.kind === 'signed-in' && code) void sendPairCode(code);
  }, [status.kind, code]);
  if (status.kind === 'checking') return null;
  if (status.kind === 'signed-out') return <PairPage local={status.local} code={code} />;
  if (status.kind === 'not-running') return <NotRunningPage />;
  return <>{children}</>;
}
