/**
 * In-memory stand-in for GitHub's OAuth device flow on github.com: `POST /login/device/code` and
 * `POST /login/oauth/access_token`, answering like the live endpoints (200 with an `error` while waiting).
 * The test plays the person: `approve()`, `deny()` or `expire()` the code shown.
 */
export function fakeGitHubDevice(opts: { clientId: string; token: string; interval?: number; slowDownFirst?: number }) {
  const interval = opts.interval ?? 0;
  let state: 'none' | 'pending' | 'approved' | 'denied' | 'expired' = 'none';
  let deviceCode = '';
  let slowDowns = opts.slowDownFirst ?? 0;
  let issued = 0;
  const requests: { path: string; params: Record<string, string> }[] = [];
  const userCode = 'WDJB-MJHT';
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  async function paramsOf(init?: RequestInit): Promise<Record<string, string>> {
    const text = typeof init?.body === 'string' ? init.body : '';
    return Object.fromEntries(new URLSearchParams(text));
  }

  function tokenAnswer(params: Record<string, string>) {
    if (params.client_id !== opts.clientId) return json({ error: 'incorrect_client_credentials' });
    if (params.grant_type !== 'urn:ietf:params:oauth:grant-type:device_code')
      return json({ error: 'unsupported_grant_type' });
    if (params.device_code !== deviceCode) return json({ error: 'incorrect_device_code' });
    if (slowDowns > 0) {
      slowDowns--;
      return json({ error: 'slow_down', interval: interval + 5 });
    }
    switch (state) {
      case 'approved':
        issued++;
        state = 'none';
        return json({ access_token: opts.token, token_type: 'bearer', scope: 'repo' });
      case 'denied':
        return json({ error: 'access_denied' });
      case 'expired':
        return json({ error: 'expired_token' });
      default:
        return json({ error: 'authorization_pending' });
    }
  }

  const fetch = (async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const params = await paramsOf(init);
    requests.push({ path: url.pathname, params });
    if (init?.method !== 'POST') return new Response('not found', { status: 404 });
    if (url.pathname === '/login/device/code') {
      if (params.client_id !== opts.clientId) return new Response('{"error":"Not Found"}', { status: 404 });
      state = 'pending';
      deviceCode = `dc_${requests.length}_secret`;
      return json({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: `${url.origin}/login/device`,
        expires_in: 900,
        interval,
      });
    }
    if (url.pathname === '/login/oauth/access_token') return tokenAnswer(params);
    return new Response('not found', { status: 404 });
  }) as typeof globalThis.fetch;

  return {
    fetch,
    userCode,
    requests,
    issued: () => issued,
    handles: (path: string) => path === '/login/device/code' || path === '/login/oauth/access_token',
    approve: () => void (state = 'approved'),
    deny: () => void (state = 'denied'),
    expire: () => void (state = 'expired'),
  };
}
