import type { SlackStatus } from '@teamtrail/connector-slack';
import { describe, expect, it } from 'vitest';
import { slackNeeds } from '../src/features/slack/slackNeeds';

const base = { enabled: true, state: 'online' } as SlackStatus;

describe('slackNeeds: what the header asks of the trail lead for Slack', () => {
  it('a dropped owner from an earlier version: set it again', () => {
    const s = { ...base, ownerRedo: { was: { id: 'U0ANA0001', name: 'ana' }, via: 'home' } } as SlackStatus;
    expect(slackNeeds(s)?.label).toBe('Set Slack owner again');
  });
  it('an account that entered the code: confirm it; rejected tokens come first; nothing when off', () => {
    const pending = { ...base, pendingOwner: { id: 'U0ANA0001', via: 'code' } } as SlackStatus;
    expect(slackNeeds(pending)?.label).toBe('Confirm Slack owner');
    expect(slackNeeds({ ...pending, state: 'auth-error' })?.label).toBe('Slack disconnected');
    expect(slackNeeds({ ...pending, enabled: false })).toBeUndefined();
    expect(slackNeeds(base)).toBeUndefined();
  });
});
