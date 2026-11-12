import type { ServiceConfig } from './types';

type Env = Record<string, string | undefined>;

function required(env: Env, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function httpsUrl(env: Env, name: string, fallback: string) {
  const raw = env[name]?.trim() || fallback;
  const url = new URL(raw);
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !local) throw new Error(`${name} must be https`);
  return raw.replace(/\/$/, '');
}

function tokenKey(env: Env) {
  const key = Buffer.from(required(env, 'SCOUT_TOKEN_KEY'), 'base64');
  if (key.length !== 32) throw new Error('SCOUT_TOKEN_KEY must be 32 bytes, base64 (openssl rand -base64 32)');
  return key;
}

/**
 * The service's settings from its environment. Slack's addresses can point at a fake on this machine (tests,
 * development), never at another plain-http host.
 */
export function loadConfig(env: Env): ServiceConfig {
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  if (!databaseUrl && env.SCOUT_MEMORY_STORE !== '1')
    throw new Error('DATABASE_URL is not set (SCOUT_MEMORY_STORE=1 keeps everything in memory, for development)');
  return {
    port: Number(env.PORT ?? 8080),
    publicUrl: httpsUrl(env, 'PUBLIC_URL', required(env, 'PUBLIC_URL')),
    slackClientId: required(env, 'SLACK_CLIENT_ID'),
    slackClientSecret: required(env, 'SLACK_CLIENT_SECRET'),
    slackSigningSecret: required(env, 'SLACK_SIGNING_SECRET'),
    tokenKey: tokenKey(env),
    databaseUrl,
    trustProxy: env.TRUST_PROXY === '1',
    slackApiUrl: httpsUrl(env, 'SLACK_API_URL', 'https://slack.com/api'),
    slackAuthorizeUrl: httpsUrl(env, 'SLACK_AUTHORIZE_URL', 'https://slack.com/oauth/v2/authorize'),
    slackHooksOrigin: httpsUrl(env, 'SLACK_HOOKS_ORIGIN', 'https://hooks.slack.com'),
  };
}
