import type { TrackerErrorCode } from './http';
import type { GitHubAccount } from './types';

/** GitHub's answer to `POST /login/device/code`: the code the person types, where, and how often to ask. */
export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** Seconds the codes stay valid. */
  expiresIn: number;
  /** Seconds to wait between token requests. */
  interval: number;
}

/** One `POST /login/oauth/access_token` with the device code. */
export type DeviceTokenPoll =
  | { kind: 'token'; token: string; scope: string }
  | { kind: 'pending' }
  | { kind: 'slow-down'; interval: number }
  | { kind: 'expired' }
  | { kind: 'denied' }
  | { kind: 'error'; error: string; code?: TrackerErrorCode };

/** `POST <api>/trackers/github/sign-in/start`: the code to show. The device code itself stays in the process. */
export type GitHubSignInStart =
  | { kind: 'code'; userCode: string; verificationUri: string; expiresAt: string; interval: number }
  | { kind: 'unavailable' }
  | { kind: 'error'; error: string; code?: TrackerErrorCode };

/** `POST <api>/trackers/github/sign-in/poll`: where the sign-in stands. Contains no secrets. */
export type GitHubSignInPoll =
  | { kind: 'waiting'; interval: number }
  | { kind: 'signed-in'; account: GitHubAccount }
  | { kind: 'expired' }
  | { kind: 'denied' }
  | { kind: 'none' }
  | { kind: 'error'; error: string; code?: TrackerErrorCode };
