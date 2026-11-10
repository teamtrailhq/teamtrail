import type { SlackStatus } from '@teamtrail/connector-slack';

/**
 * What Slack needs from the trail lead right now, for the header: tokens Slack rejected, or a Slack account that
 * waits to be confirmed as the owner (until then nothing is sent there). Undefined when nothing is needed.
 */
export function slackNeeds(s: SlackStatus): { label: string; why: string } | undefined {
  if (!s.enabled) return undefined;
  if (s.state === 'auth-error') return { label: 'Slack disconnected', why: s.error ?? 'Slack rejected the tokens' };
  if (s.pendingOwner)
    return { label: 'Confirm Slack owner', why: 'Nothing is sent in Slack until you confirm which account is yours' };
  return undefined;
}
