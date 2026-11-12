import { createHmac } from 'node:crypto';
import { secrets } from './secrets';

const WINDOW_S = 5 * 60;

interface SignedRequest {
  body: string;
  timestamp: string | undefined;
  signature: string | undefined;
  signingSecret: string;
  now: number;
}

/**
 * Whether a request is Slack's (v0 signing): HMAC-SHA256 of `v0:<timestamp>:<body>` with the app's signing
 * secret, within five minutes of now, compared in constant time.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(r: SignedRequest) {
  if (!r.timestamp || !r.signature || !/^\d{1,12}$/.test(r.timestamp)) return false;
  if (Math.abs(r.now / 1000 - Number(r.timestamp)) > WINDOW_S) return false;
  const mac = createHmac('sha256', r.signingSecret).update(`v0:${r.timestamp}:${r.body}`).digest('hex');
  return secrets.sameText(`v0=${mac}`, r.signature);
}
