import { type VerificationConfig } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
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

async function fetchConfig(): Promise<VerificationConfigView | null> {
  const r = await fetch(`${apiBase()}/verification/config`);
  return r.ok ? ((await r.json()) as VerificationConfigView) : null;
}

/**
 * `verification.json` as the local server reads it, kept fresh when the file changes and when the attention queue
 * moves (approving the file on this machine moves it). undefined while loading, null without a server (static build).
 */
export function useVerificationConfig() {
  const [view, setView] = useState<VerificationConfigView | null>();
  useLiveLoad({
    load: fetchConfig,
    show: setView,
    failed: () => setView(null),
    changed: (p) => p.endsWith('verification.json'),
    events: { attention: () => true },
  });
  return view;
}
