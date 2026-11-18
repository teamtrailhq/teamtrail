import type { GateLog } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

async function fetchLog(): Promise<GateLog | null> {
  const r = await fetch(`${apiBase()}/verification/gates`);
  return r.ok ? ((await r.json()) as GateLog) : null;
}

/**
 * What the verification gates held back or would have, every trail, the last two weeks. Gates fire as completions
 * are verified, so it loads again when verification or the attention queue moves. undefined while loading, null
 * without a server.
 */
export function useGateLog() {
  const [log, setLog] = useState<GateLog | null>();
  useLiveLoad({
    load: fetchLog,
    show: setLog,
    failed: () => setLog(null),
    changed: (p) => p.endsWith('verification.json'),
    events: { verification: () => true, attention: () => true },
  });
  return log;
}
