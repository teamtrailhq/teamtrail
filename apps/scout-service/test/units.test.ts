/** The small pieces: signatures, the cipher, return addresses, scopes, config and parsing. */
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { TokenCipher } from '../src/crypto/TokenCipher';
import { verifySlackSignature } from '../src/crypto/verifySlackSignature';
import { parseClientMessage } from '../src/hub/parseClientMessage';
import { returnAddress } from '../src/install/returnAddress';
import { loadConfig } from '../src/loadConfig';
import { BOT_SCOPES } from '../src/slack/botScopes';

const sign = (body: string, ts: string, secret = 's') =>
  `v0=${createHmac('sha256', secret).update(`v0:${ts}:${body}`).digest('hex')}`;

describe('verifySlackSignature', () => {
  const now = 1_700_000_000_000;
  const ts = String(now / 1000);
  const check = (o: Partial<Parameters<typeof verifySlackSignature>[0]>) =>
    verifySlackSignature({ body: 'a=1', timestamp: ts, signature: sign('a=1', ts), signingSecret: 's', now, ...o });

  test('accepts Slack signature and refuses everything else', () => {
    expect(check({})).toBe(true);
    expect(check({ body: 'a=2' })).toBe(false);
    expect(check({ signingSecret: 'other' })).toBe(false);
    expect(check({ signature: undefined })).toBe(false);
    expect(check({ signature: 'v0=short' })).toBe(false);
    expect(check({ timestamp: 'abc' })).toBe(false);
    expect(check({ now: now + 5 * 60_000 + 1000 })).toBe(false);
    expect(check({ now: now - 5 * 60_000 - 1000 })).toBe(false);
  });
});

describe('TokenCipher', () => {
  test('opens only with the same key and team', () => {
    const key = randomBytes(32);
    const sealed = new TokenCipher(key).seal('xoxb-1', 'T1');
    expect(sealed.startsWith('v1:')).toBe(true);
    expect(new TokenCipher(key).open(sealed, 'T1')).toBe('xoxb-1');
    expect(() => new TokenCipher(key).open(sealed, 'T2')).toThrow();
    expect(() => new TokenCipher(randomBytes(32)).open(sealed, 'T1')).toThrow();
    expect(() => new TokenCipher(randomBytes(16))).toThrow();
  });
});

test('returnAddress keeps loopback Lookouts with a port only', () => {
  expect(returnAddress('http://127.0.0.1:7477/?settings=slack')).toBe('http://127.0.0.1:7477/?settings=slack');
  expect(returnAddress('http://[::1]:7477/')).toBe('http://[::1]:7477/');
  expect(returnAddress('http://localhost:7477')).toBe('http://localhost:7477/');
  for (const bad of ['http://127.0.0.1/', 'http://10.0.0.2:7477/', 'http://127.0.0.1:7477/#a', 7477, undefined])
    expect(returnAddress(bad)).toBeUndefined();
});

test('the scopes asked for are the manifest scopes', () => {
  const manifest = JSON.parse(readFileSync(new URL('../slack-manifest.json', import.meta.url), 'utf8'));
  expect([...BOT_SCOPES].sort()).toEqual([...manifest.oauth_config.scopes.bot].sort());
  expect(manifest.settings.socket_mode_enabled).toBe(false);
  expect(manifest.display_information.name).toBe('Scout');
});

describe('loadConfig', () => {
  const env = {
    PUBLIC_URL: 'https://scout.teamtrail.app/',
    SLACK_CLIENT_ID: 'id',
    SLACK_CLIENT_SECRET: 'secret',
    SLACK_SIGNING_SECRET: 'sign',
    SCOUT_TOKEN_KEY: randomBytes(32).toString('base64'),
    DATABASE_URL: 'postgres://x',
  };

  test('reads a full environment', () => {
    const c = loadConfig(env);
    expect(c.publicUrl).toBe('https://scout.teamtrail.app');
    expect(c.slackApiUrl).toBe('https://slack.com/api');
    expect(c.trustProxy).toBe(false);
  });

  test('refuses missing secrets, a short key, plain http elsewhere and no database', () => {
    expect(() => loadConfig({ ...env, SLACK_SIGNING_SECRET: '' })).toThrow(/SLACK_SIGNING_SECRET/);
    expect(() => loadConfig({ ...env, SCOUT_TOKEN_KEY: 'c2hvcnQ=' })).toThrow(/32 bytes/);
    expect(() => loadConfig({ ...env, SLACK_API_URL: 'http://evil.example/api' })).toThrow(/https/);
    expect(() => loadConfig({ ...env, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
    expect(loadConfig({ ...env, DATABASE_URL: '', SCOUT_MEMORY_STORE: '1' }).databaseUrl).toBeUndefined();
  });
});

test('parseClientMessage takes the three shapes only', () => {
  expect(parseClientMessage('{"type":"hello","token":"t"}')).toEqual({ type: 'hello', token: 't' });
  expect(parseClientMessage('{"type":"call","id":"a1","method":"chat.postMessage","args":{"x":1}}')).toEqual({
    type: 'call',
    id: 'a1',
    method: 'chat.postMessage',
    args: { x: 1 },
  });
  for (const bad of [
    '[]',
    'null',
    '{"type":"call","id":"a b","method":"x.y"}',
    '{"type":"call","id":"a","method":"../x"}',
  ])
    expect(parseClientMessage(bad)).toBeUndefined();
});
