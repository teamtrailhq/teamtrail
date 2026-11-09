import { describeError } from '../describeError';
import { HttpClient, github, type HttpOptions } from '../http';
import type { DeviceTokenPoll } from '../signInTypes';
import { deviceRequest } from './deviceRequest';
import { webBase } from './webBase';

const GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

interface TokenBody {
  access_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  interval?: number;
}

function fromBody(body: TokenBody | undefined): DeviceTokenPoll {
  if (body?.access_token) return { kind: 'token', token: body.access_token, scope: body.scope ?? '' };
  switch (body?.error) {
    case 'authorization_pending':
      return { kind: 'pending' };
    case 'slow_down':
      return { kind: 'slow-down', interval: body.interval ?? 10 };
    case 'expired_token':
      return { kind: 'expired' };
    case 'access_denied':
      return { kind: 'denied' };
    default:
      return { kind: 'error', error: body?.error_description ?? body?.error ?? 'GitHub did not answer the sign-in' };
  }
}

/**
 * Asks once whether the person approved the code: `POST /login/oauth/access_token`. GitHub answers 200 with an
 * `error` while it waits (`authorization_pending`, `slow_down`), or when the code expired or was denied. Never throws.
 */
export async function pollDeviceToken(
  o: { clientId: string; deviceCode: string; webUrl?: string } & HttpOptions,
): Promise<DeviceTokenPoll> {
  const http = new HttpClient(github, { retries: 0, ...o });
  const params = { client_id: o.clientId, device_code: o.deviceCode, grant_type: GRANT };
  try {
    const url = `${webBase(o.webUrl)}/login/oauth/access_token`;
    const { body } = await http.send<TokenBody>(url, deviceRequest(params));
    return fromBody(body);
  } catch (err) {
    const { error, code } = describeError(err, 'GitHub');
    return { kind: 'error', error: error ?? 'GitHub did not answer the sign-in', code };
  }
}
