/** The Lookout serves on 127.0.0.1 and [::1] only, never `localhost` (which a hosts file can point anywhere). */
const LOOPBACK = new Set(['127.0.0.1', '[::1]']);

/**
 * The address a finished install sends the browser back to, or undefined when it isn't allowed: only a Lookout
 * on this person's machine, over http on a loopback host with an explicit port, with no user info and no
 * fragment (the service adds its own). The service never redirects anywhere else, so a link to /install can't
 * be used to send a code to someone else's site.
 */
export function returnAddress(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 512) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  const allowed =
    url.protocol === 'http:' &&
    LOOPBACK.has(url.hostname) &&
    url.port !== '' &&
    url.username === '' &&
    url.password === '' &&
    url.hash === '' &&
    !raw.includes('#');
  return allowed ? url.toString() : undefined;
}
