/**
 * The code of a sign-in link (`#pair=<code>`), taken out of the address bar at once so it stays in no history entry.
 * In the fragment, it never reached a server, a log or a Referer.
 */
export function takePairCode(): string | undefined {
  const match = /(?:^#|&)pair=([A-Za-z0-9_-]{1,64})/.exec(location.hash);
  if (!match) return undefined;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return match[1];
}
