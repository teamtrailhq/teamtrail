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

/** Railway sets these in every deploy; `NODE_ENV=production` counts too. */
const PRODUCTION_MARKERS = ['RAILWAY_ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_PROJECT_ID'];

const inProduction = (env: Env) => env.NODE_ENV === 'production' || PRODUCTION_MARKERS.some((k) => !!env[k]);

const SSL_MODES = new Set(['verify', 'no-verify', 'off']);

/**
 * TLS to Postgres: `DATABASE_SSL` when set; otherwise off on Railway's private network (`*.railway.internal`,
 * which never leaves the project) and verified everywhere else.
 */
function databaseSsl(env: Env, url: string | undefined): ServiceConfig['databaseSsl'] {
  const set = env.DATABASE_SSL?.trim();
  if (set) {
    if (!SSL_MODES.has(set)) throw new Error('DATABASE_SSL must be verify, no-verify or off');
    return set as ServiceConfig['databaseSsl'];
  }
  if (!url) return 'off';
  return new URL(url).hostname.endsWith('.railway.internal') ? 'off' : 'verify';
}

/** In production the service runs behind Railway's proxy, with a database: anything else is refused at start. */
function checkProduction(env: Env, databaseUrl: string | undefined) {
  if (!inProduction(env)) return;
  if (env.TRUST_PROXY !== '1')
    throw new Error("TRUST_PROXY=1 is required in production: rate limits must see the client, not Railway's proxy");
  if (!databaseUrl) throw new Error('DATABASE_URL is required in production (SCOUT_MEMORY_STORE is for development)');
}

/**
 * The service's settings from its environment. Slack's addresses can point at a fake on this machine (tests,
 * development), never at another plain-http host.
 */
export function loadConfig(env: Env): ServiceConfig {
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  checkProduction(env, databaseUrl);
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
    databaseSsl: databaseSsl(env, databaseUrl),
    slackApiUrl: httpsUrl(env, 'SLACK_API_URL', 'https://slack.com/api'),
    slackAuthorizeUrl: httpsUrl(env, 'SLACK_AUTHORIZE_URL', 'https://slack.com/oauth/v2/authorize'),
    slackHooksOrigin: httpsUrl(env, 'SLACK_HOOKS_ORIGIN', 'https://hooks.slack.com'),
  };
}
