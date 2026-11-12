/**
 * The code the Scout service sends the browser back with (`#slack-link=<code>`) after Slack's consent screen, taken
 * out of the address bar at once so it stays in no history entry. In the fragment, it never reached a server, a log
 * or a Referer, and it is useless without the verifier only this Lookout's server holds.
 */
function takeSlackLink(): string | undefined {
  if (typeof location === 'undefined') return undefined;
  const match = /(?:^#|&)slack-link=([A-Za-z0-9_-]{43})/.exec(location.hash);
  if (!match) return undefined;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return match[1];
}

/** Taken when the page loads, before anything renders: Settings → Slack finishes connecting with it. */
export const returnedLink = { code: takeSlackLink() };
