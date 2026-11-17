import type { CheckFinding, ScreenedCheck } from '@teamtrail/core';
import { apiBase } from './apiBase';

/**
 * What reading the repo says about whether each check's command can run (`POST /verification/screen`). Undefined
 * when the server didn't answer: the editor then shows nothing rather than a stale warning.
 */
export async function screenCheckRows(
  checks: ScreenedCheck[],
  signal?: AbortSignal,
): Promise<CheckFinding[] | undefined> {
  const res = await fetch(`${apiBase()}/verification/screen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checks }),
    signal,
  }).catch(() => undefined);
  if (!res?.ok) return undefined;
  const body = (await res.json().catch(() => ({}))) as { findings?: CheckFinding[] };
  return body.findings;
}
