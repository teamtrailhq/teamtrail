import { HttpClient, github, type HttpOptions } from '../http';
import type { DeviceCode } from '../signInTypes';
import { deviceRequest } from './deviceRequest';
import { webBase } from './webBase';

interface DeviceCodeBody {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
}

/** Starts GitHub's device flow: `POST /login/device/code` with the client id and the `repo` scope. Throws on failure. */
export async function requestDeviceCode(o: { clientId: string; webUrl?: string } & HttpOptions): Promise<DeviceCode> {
  const http = new HttpClient(github, { retries: 0, ...o });
  const params = { client_id: o.clientId, scope: 'repo' };
  const { body } = await http.send<DeviceCodeBody>(`${webBase(o.webUrl)}/login/device/code`, deviceRequest(params));
  if (!body?.device_code || !body.user_code || !body.verification_uri)
    throw new Error(body?.error_description ?? body?.error ?? 'GitHub did not return a sign-in code');
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    expiresIn: body.expires_in ?? 900,
    interval: body.interval ?? 5,
  };
}
