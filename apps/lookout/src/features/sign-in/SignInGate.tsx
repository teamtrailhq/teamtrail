import type { ReactNode } from 'react';
import { PairPage } from './PairPage';
import { useSignInStatus } from './useSignInStatus';

/** The Lookout once this browser is paired; "Pair this browser" until then. Nothing shows while it asks. */
export function SignInGate({ children }: { children: ReactNode }) {
  const status = useSignInStatus();
  if (status.kind === 'checking') return null;
  if (status.kind === 'signed-out') return <PairPage local={status.local} ambiguous={status.ambiguous} />;
  return <>{children}</>;
}
