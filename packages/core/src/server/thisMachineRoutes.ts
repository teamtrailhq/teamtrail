/*
 * What only the machine itself may do. The Lookout has no sign-in, and with `--host` a phone or laptop on the
 * same network can open it: to read the trail, answer questions, approve and steer. What that other device may
 * not do is change what runs on this machine or whom it trusts. Those routes answer loopback connections only
 * (requestGuard.ts `fromThisMachine`), and this list is the one place that says which they are.
 */
export const ELSEWHERE = 'This can only be changed on the machine Teamtrail runs on. Open the Lookout there.';

const WRITES: RegExp[] = [
  // Tracker connection: tokens and keys, sign-in, which repo or team the trails live in.
  /^\/trackers(\/|$)/,
  // Slack tokens, who the owner is (the one-time code, confirming, resetting) and where questions are sent.
  /^\/slack(\/|$)/,
  // What agents may decide alone.
  /^\/policy$/,
  // Worktrees on this disk: the setting, and removing a folder.
  /^\/workspaces$/,
  /^\/workspaces\/remove$/,
  // Guides: installing, approving, and approving the check commands they add to verification.json. Which guide a
  // ticket or a trail uses is steering, not trust, and stays open.
  /^\/guides\/(?!ticket$|team$)/,
  // This person's own attention preferences, kept in their config dir.
  /^\/attention\/prefs$/,
  // The projects this Lookout supervises.
  /^\/projects$/,
  /^\/projects\/settings$/,
];

/**
 * Every method, reads included: the tokens, and everything under the tracker settings that uses this machine's
 * stored credentials to look something up (the repos a GitHub token can see, a Linear key's teams and projects,
 * the members of the Slack workspace). The settings themselves (`GET /trackers`, `GET /slack`) stay readable,
 * without the account (redactForLan.ts).
 */
const ALWAYS: RegExp[] = [/^\/remote-agents(\/|$)/, /^\/trackers\/.+/, /^\/slack\/.+/];

const REMOVE_PROJECT = /^\/projects\/[^/]+$/;

/** Whether a request may only come from this machine. `pathname` has the API prefix (and any `/p/<id>`) stripped. */
export function thisMachineOnly(method: string | undefined, pathname: string): boolean {
  if (ALWAYS.some((r) => r.test(pathname))) return true;
  if (method === 'GET' || method === 'HEAD') return false;
  if (method === 'DELETE' && REMOVE_PROJECT.test(pathname)) return true;
  return WRITES.some((r) => r.test(pathname));
}
