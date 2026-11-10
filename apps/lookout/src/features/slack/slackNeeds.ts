import type { SlackStatus } from '@teamtrail/connector-slack';

/**
 * What Slack needs from the trail lead right now, for the header: tokens Slack rejected, a Slack account that
 * entered the code and waits to be confirmed, or an owner an earlier version chose that has to be set again (until
 * then nothing is sent there). Undefined when nothing is needed.
 */
export function slackNeeds(s: SlackStatus): { label: string; why: string } | undefined {
  if (!s.enabled) return undefined;
  if (s.state === 'auth-error') return { label: 'Slack disconnected', why: s.error ?? 'Slack rejected the tokens' };
  if (s.pendingOwner)
    return { label: 'Confirm Slack owner', why: 'Nothing is sent in Slack until you confirm which account is yours' };
  if (s.ownerRedo)
    return { label: 'Set Slack owner again', why: 'Nothing is sent in Slack until you set the owner with a code' };
  return undefined;
}
