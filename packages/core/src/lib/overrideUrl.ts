const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * A base URL from an override environment variable (`$TEAMTRAIL_GITHUB_API`, `_LINEAR_API`, `_GITHUB_WEB`,
 * `_SLACK_API`), when it is safe to send credentials to: https anywhere (GitHub Enterprise), plain http only to
 * this machine (the fakes in the end-to-end check). Anything else is ignored, with a warning, and the real API is
 * used. These are read from the environment only, never from a file in the repo.
 */
export function overrideUrl(env: Record<string, string | undefined>, name: string): string | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return ignored(name, 'it is not a URL');
  }
  if (url.username || url.password) return ignored(name, 'it carries credentials');
  if (url.protocol === 'https:') return raw;
  if (url.protocol === 'http:' && LOOPBACK.has(url.hostname)) return raw;
  return ignored(name, 'only https, or http to this machine, is allowed');
}

function ignored(name: string, why: string): undefined {
  console.warn(`teamtrail: ignoring $${name}: ${why}`);
  return undefined;
}
