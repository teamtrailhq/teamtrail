import { webUrl } from '@teamtrail/core';
import { apiBase } from './apiBase';

/** What asking to merge came to: merged (with the pull request's link), or why not, as the server said it. */
export type MergeResult = { kind: 'merged'; url?: string } | { kind: 'error'; text: string };

const NO_ANSWER = "The server didn't answer. Try again.";
const said = (body: { error?: unknown }, status: number) =>
  String(body.error ?? `The server answered ${status}.`).slice(0, 300);

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

/**
 * Merge anyway's first step: the trail lead's acceptance of exactly the gaps the page showed, recorded by this
 * Lookout's engine as their decision (`POST /proof/merge-anyway`). Its `gapsHash` is what the merge then names.
 */
async function acceptGaps(o: { mapId: string; ticketId: string; gaps: string[] }) {
  const r = await postJson(`${apiBase()}/proof/merge-anyway`, o);
  const hash = r.json.gapsHash;
  if (r.ok && typeof hash === 'string') return { hash };
  return { error: said(r.json, r.status) };
}

/**
 * Asks the server that merges pull requests (managedSignIn.ts `merge`) to merge a done ticket's pull request. With
 * `gaps` (an unverified proof's), the trail lead's acceptance of them is recorded first, and the merge names it:
 * `{anyway: true, gaps: <its hash>}`. The server checks everything again either way.
 */
export async function postMerge(o: {
  path: string;
  mapId: string;
  ticketId: string;
  gaps?: string[];
}): Promise<MergeResult> {
  try {
    const accepted = o.gaps ? await acceptGaps({ mapId: o.mapId, ticketId: o.ticketId, gaps: o.gaps }) : undefined;
    if (accepted && 'error' in accepted) return { kind: 'error', text: accepted.error ?? NO_ANSWER };
    const anyway = accepted ? { anyway: true, gaps: accepted.hash } : {};
    const r = await postJson(o.path, { trail: o.mapId, ticket: o.ticketId, ...anyway });
    const url = typeof r.json.url === 'string' ? webUrl(r.json.url) : undefined;
    if (r.ok && r.json.merged) return { kind: 'merged', url };
    return { kind: 'error', text: said(r.json, r.status) };
  } catch {
    return { kind: 'error', text: NO_ANSWER };
  }
}
