/**
 * The routes that are event streams: the bridge's `/events` and a GitHub or Linear tracker's own events. A page's
 * EventSource can't send the session header, so these take a single-use stream ticket instead (signInGate.ts), and
 * revoking the session ends them (lookoutSignIn.ts `holdStream`).
 */
export const isEventStreamRoute = (route: string) =>
  route === '/events' || /^\/tracker\/(github|linear)\/events$/.test(route);
