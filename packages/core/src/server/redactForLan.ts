import type { ServerResponse } from 'node:http';

/** Keys whose value is a place on this machine's disk. */
const PATH_KEYS = new Set(['path', 'root', 'cwd', 'repoRoot', 'toplevel', 'worktree', 'transcriptPath', 'dir', 'file']);
/** Keys that say whose tracker account this machine is signed in to. */
const ACCOUNT_KEYS = new Set(['account', 'viewer']);
const ABSOLUTE = /^(\/|[A-Za-z]:[\\/])/;

/** An absolute path as its last two segments: enough to recognise a repo, nothing about where it lives. */
const short = (p: string) => p.split(/[\\/]/).filter(Boolean).slice(-2).join('/');

/**
 * What another device on the network gets to see of a JSON answer: the same, without where things live on this
 * machine's disk (absolute paths become their last two segments) and without the tracker account it is signed
 * in to. Repo-relative paths, which the Lookout shows everywhere, are left alone.
 */
export function redactForLan(value: unknown, key = ''): unknown {
  if (typeof value === 'string') return PATH_KEYS.has(key) && ABSOLUTE.test(value) ? short(value) : value;
  if (Array.isArray(value)) return value.map((v) => redactForLan(v, key));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (!ACCOUNT_KEYS.has(k)) out[k] = redactForLan(v, k);
  return out;
}

/** Makes every JSON answer on this response go through `redactForLan`. Safe to apply twice. */
export function redactResponse(res: ServerResponse) {
  const marked = res as ServerResponse & { redactsForLan?: boolean };
  if (marked.redactsForLan) return;
  marked.redactsForLan = true;
  const end = res.end.bind(res) as (...args: unknown[]) => ServerResponse;
  res.end = ((chunk?: unknown, ...rest: unknown[]) => {
    const json =
      typeof chunk === 'string' && String(res.getHeader('Content-Type') ?? '').startsWith('application/json');
    if (!json) return end(chunk, ...rest);
    try {
      return end(JSON.stringify(redactForLan(JSON.parse(chunk as string))), ...rest);
    } catch {
      return end(chunk, ...rest);
    }
  }) as ServerResponse['end'];
}
