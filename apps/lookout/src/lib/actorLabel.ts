import type { SlackUser } from '@teamtrail/connector-slack';

/** The Slack people the Lookout can name: the confirmed owner and the allowed users from Settings → Slack. */
export interface SlackPeople {
  owners: Pick<SlackUser, 'id' | 'name' | 'realName' | 'displayName'>[];
  allow: Pick<SlackUser, 'id' | 'name' | 'realName' | 'displayName'>[];
}

const SLACK = /^slack:([A-Z0-9]+)$/i;

/**
 * Who did something, as a person: `slack:U0CH6NFARQC` becomes "you (Slack)" for the owner, the allowed user's name,
 * or "Slack user" when the Lookout doesn't know the account. Anything else is shown as it is.
 */
export function actorLabel(raw: string, people?: SlackPeople): string {
  const id = SLACK.exec(raw)?.[1];
  if (!id) return raw;
  if (people?.owners.some((u) => u.id === id)) return 'you (Slack)';
  const known = people?.allow.find((u) => u.id === id);
  const name = known?.realName || known?.name;
  return name ? `${name} (Slack)` : 'Slack user';
}
