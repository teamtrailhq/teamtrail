import { type VerificationConfig } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';

export interface VerificationConfigView {
  file: string;
  exists: boolean;
  errors: string[];
  hash?: string;
  config?: VerificationConfig;
  /** Whether its commands run on this machine: `waiting` until the trail lead approves the file as it is. */
  approval?: { state: string; waiting: boolean };
}

/** `verification.json` as the local server reads it; undefined while loading, null without a server (static build). */
export function useVerificationConfig() {
  const [view, setView] = useState<VerificationConfigView | null>();
  useEffect(() => {
    let live = true;
    fetch(`${apiBase()}/verification/config`)
      .then((r) => (r.ok ? (r.json() as Promise<VerificationConfigView>) : null))
      .then(
        (v) => live && setView(v),
        () => live && setView(null),
      );
    return () => {
      live = false;
    };
  }, []);
  return view;
}
