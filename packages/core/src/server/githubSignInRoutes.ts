import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GitHubSignIn } from './githubSignIn';
import { sendJson } from './http';

export const GITHUB_SIGN_IN = '/trackers/github/sign-in';

/**
 * Sign in with GitHub (OAuth device flow):
 *   POST   /trackers/github/sign-in/start    GitHubSignInStart: the user code and where to enter it
 *   POST   /trackers/github/sign-in/poll     GitHubSignInPoll: waiting, signed in (with the login), expired, denied
 *   POST   /trackers/github/sign-in/cancel   stop waiting for the code
 *   DELETE /trackers/github/sign-in          sign out: forget the signed-in token on this machine
 * Neither the device code nor the token is ever sent to the page.
 */
export async function handleGitHubSignIn(
  req: IncomingMessage,
  res: ServerResponse,
  o: { path: string; signIn: GitHubSignIn; settings: () => Promise<unknown> },
): Promise<boolean> {
  const { path: p, signIn } = o;
  if (p !== GITHUB_SIGN_IN && !p.startsWith(`${GITHUB_SIGN_IN}/`)) return false;
  const action = p.slice(GITHUB_SIGN_IN.length + 1);
  if (req.method === 'DELETE' && !action) {
    signIn.signOut();
    return (sendJson(res, 200, await o.settings()), true);
  }
  if (req.method !== 'POST') return (sendJson(res, 405, { error: 'method not allowed' }), true);
  switch (action) {
    case 'start':
      return (sendJson(res, 200, await signIn.start()), true);
    case 'poll':
      return (sendJson(res, 200, await signIn.poll()), true);
    case 'cancel':
      signIn.cancel();
      return (sendJson(res, 200, { kind: 'none' }), true);
    default:
      return (sendJson(res, 404, { error: 'not found' }), true);
  }
}
