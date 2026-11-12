import type { SlackStatus } from '@teamtrail/connector-slack';
import { describe, expect, it } from 'vitest';
import { slackNeeds } from '../src/features/slack/slackNeeds';

const base = { enabled: true, connected: true, state: 'online' } as SlackStatus;

describe('slackNeeds: what the header asks of the trail lead for Slack', () => {
  it('a setup from a version with your own Slack app: add Scout again', () => {
    const s = { ...base, connected: false, enabled: false, state: 'off', legacy: true } as SlackStatus;
    expect(slackNeeds(s)?.label).toBe('Add Scout to Slack again');
  });
  it('Scout disconnected by the service: say so; nothing while online or never connected', () => {
    const off = { ...base, enabled: false, state: 'auth-error', error: 'Scout was removed' } as SlackStatus;
    expect(slackNeeds(off)).toEqual({ label: 'Slack disconnected', why: 'Scout was removed' });
    expect(slackNeeds(base)).toBeUndefined();
    expect(slackNeeds({ ...base, connected: false, enabled: false, state: 'off' })).toBeUndefined();
  });
});
