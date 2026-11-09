import type { GitHubSignInPoll, GitHubSignInStart } from '@teamtrail/core';

/** Where Sign in with GitHub stands in the page. */
export type SignInState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'code'; userCode: string; verificationUri: string; interval: number; asked: number }
  | { kind: 'ended'; reason: string };

/** The answer to Start, as the next state. */
export function afterStart(r: GitHubSignInStart): SignInState {
  switch (r.kind) {
    case 'code':
      return { kind: 'code', userCode: r.userCode, verificationUri: r.verificationUri, interval: r.interval, asked: 0 };
    case 'unavailable':
      return { kind: 'ended', reason: 'Sign in with GitHub isn’t set up in this build' };
    case 'error':
      return { kind: 'ended', reason: r.error };
    default: {
      const never: never = r;
      return never;
    }
  }
}

/** The answer to a poll while the code shows, as the next state; `signed-in` is handled by the caller. */
export function afterPoll(prev: Extract<SignInState, { kind: 'code' }>, r: GitHubSignInPoll): SignInState {
  switch (r.kind) {
    case 'waiting':
      return { ...prev, interval: r.interval, asked: prev.asked + 1 };
    case 'signed-in':
      return { kind: 'idle' };
    case 'expired':
      return { kind: 'ended', reason: 'The code expired before it was approved' };
    case 'denied':
      return { kind: 'ended', reason: 'The sign-in was declined on GitHub' };
    case 'none':
      return { kind: 'ended', reason: 'The sign-in was stopped' };
    case 'error':
      return { kind: 'ended', reason: r.error };
    default: {
      const never: never = r;
      return never;
    }
  }
}
