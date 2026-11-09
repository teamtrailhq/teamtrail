import { describeError } from '../adapters/remote/describeError';
import { githubAccount } from '../adapters/remote/github/githubAccount';
import { githubClientId } from '../adapters/remote/github/githubClientId';
import { pollDeviceToken } from '../adapters/remote/github/pollDeviceToken';
import { requestDeviceCode } from '../adapters/remote/github/requestDeviceCode';
import type { DeviceTokenPoll, GitHubSignInPoll, GitHubSignInStart } from '../adapters/remote/signInTypes';
import type { TrackerContext } from './trackerContext';

interface Pending {
  clientId: string;
  deviceCode: string;
  /** Seconds between token requests; `slow_down` raises it. */
  interval: number;
  /** Epoch ms of the next request GitHub allows. */
  nextAt: number;
  expiresAt: number;
}

/**
 * Sign in with GitHub through the OAuth device flow, one sign-in at a time per bridge. The device code and the token
 * stay in this process; the page only sees the user code, and the token goes to the 0600 credentials file. GitHub is
 * asked at most once per `interval`, however often the page polls.
 */
export function githubSignIn(deps: { ctx: TrackerContext; changed: () => void; now?: () => number }) {
  const { ctx } = deps;
  const now = deps.now ?? Date.now;
  const http = { fetch: ctx.o.fetch, webUrl: ctx.apiUrl.githubWeb };
  let pending: Pending | undefined;
  let asking: Promise<GitHubSignInPoll> | undefined;

  async function start(): Promise<GitHubSignInStart> {
    const clientId = githubClientId(ctx.env);
    if (!clientId) return { kind: 'unavailable' };
    try {
      const code = await requestDeviceCode({ clientId, ...http });
      const at = now();
      const expiresAt = at + code.expiresIn * 1000;
      const { deviceCode, interval } = code;
      pending = { clientId, deviceCode, interval, nextAt: at + interval * 1000, expiresAt };
      const expires = new Date(expiresAt).toISOString();
      return {
        kind: 'code',
        userCode: code.userCode,
        verificationUri: code.verificationUri,
        expiresAt: expires,
        interval,
      };
    } catch (err) {
      const { error, code } = describeError(err, 'GitHub');
      return { kind: 'error', error: error ?? 'GitHub did not start the sign-in', code };
    }
  }

  async function save(token: string, scope: string): Promise<GitHubSignInPoll> {
    const creds = ctx.creds.read();
    // Signing in replaces a pasted token, so the account you just approved is the one used.
    delete creds.github;
    ctx.creds.write({ ...creds, githubSignIn: { token, scope, at: new Date().toISOString() } });
    deps.changed();
    const account = await githubAccount({ token, apiUrl: ctx.apiUrl.github, fetch: ctx.o.fetch });
    return { kind: 'signed-in', account };
  }

  async function settle(p: Pending, r: DeviceTokenPoll): Promise<GitHubSignInPoll> {
    switch (r.kind) {
      case 'token':
        pending = undefined;
        return save(r.token, r.scope);
      case 'pending':
        return { kind: 'waiting', interval: p.interval };
      case 'slow-down':
        p.interval = Math.max(r.interval, p.interval + 5);
        p.nextAt = now() + p.interval * 1000;
        return { kind: 'waiting', interval: p.interval };
      case 'expired':
      case 'denied':
        pending = undefined;
        return { kind: r.kind };
      case 'error':
        return { kind: 'error', error: r.error, code: r.code };
      default: {
        const never: never = r;
        return never;
      }
    }
  }

  async function ask(p: Pending): Promise<GitHubSignInPoll> {
    p.nextAt = now() + p.interval * 1000;
    const r = await pollDeviceToken({ clientId: p.clientId, deviceCode: p.deviceCode, ...http });
    return settle(p, r);
  }

  function poll(): Promise<GitHubSignInPoll> {
    const p = pending;
    if (!p) return Promise.resolve({ kind: 'none' });
    if (now() > p.expiresAt) {
      pending = undefined;
      return Promise.resolve({ kind: 'expired' });
    }
    if (asking) return asking;
    if (now() < p.nextAt) return Promise.resolve({ kind: 'waiting', interval: p.interval });
    asking = ask(p).finally(() => (asking = undefined));
    return asking;
  }

  return {
    start,
    poll,
    /** Stop waiting for a code the person gave up on. */
    cancel() {
      pending = undefined;
    },
    /** Forget the signed-in token on this machine. GitHub keeps the grant until it's revoked there. */
    signOut() {
      pending = undefined;
      const creds = ctx.creds.read();
      delete creds.githubSignIn;
      ctx.creds.write(creds);
      deps.changed();
    },
    available: () => !!githubClientId(ctx.env),
    signedIn: () => !!ctx.creds.read().githubSignIn?.token,
  };
}

export type GitHubSignIn = ReturnType<typeof githubSignIn>;
