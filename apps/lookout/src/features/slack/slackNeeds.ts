import type { SlackStatus } from '@teamtrail/connector-slack';

/**
 * What Slack needs from the trail lead right now, for the header: Scout disconnected (removed from the workspace,
 * or this Teamtrail let go), or a setup from a version with your own Slack app that has to be added again (until
 * then nothing is sent there). Undefined when nothing is needed.
 */
export function slackNeeds(s: SlackStatus): { label: string; why: string } | undefined {
  if (s.legacy && !s.connected)
    return { label: 'Add Scout to Slack again', why: 'Scout is now one Slack app; your own app no longer works' };
  if (s.connected && s.state === 'auth-error')
    return { label: 'Slack disconnected', why: s.error ?? 'Add Scout again' };
  return undefined;
}
