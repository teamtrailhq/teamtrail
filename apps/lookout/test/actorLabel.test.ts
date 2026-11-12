import { describe, expect, it } from 'vitest';
import { actorLabel } from '../src/lib/actorLabel';

const people = {
  owners: [{ id: 'U0OWNER1', name: 'arek' }],
  allow: [
    { id: 'U0ANA', name: 'ana', realName: 'Ana Nowak' },
    { id: 'U0BOB', name: 'bob' },
  ],
};

describe('actorLabel', () => {
  it('names the Slack owner as you', () => {
    expect(actorLabel('slack:U0OWNER1', people)).toBe('you (Slack)');
  });

  it('names an allowed user by their real name, else their handle', () => {
    expect(actorLabel('slack:U0ANA', people)).toBe('Ana Nowak (Slack)');
    expect(actorLabel('slack:U0BOB', people)).toBe('bob (Slack)');
  });

  it('never shows a raw Slack id', () => {
    expect(actorLabel('slack:U0CH6NFARQC', people)).toBe('Slack user');
    expect(actorLabel('slack:U0CH6NFARQC')).toBe('Slack user');
  });

  it('shows anyone else as they are', () => {
    expect(actorLabel('claude-01', people)).toBe('claude-01');
    expect(actorLabel('trail lead', people)).toBe('trail lead');
    expect(actorLabel('slack:', people)).toBe('slack:');
  });
});
