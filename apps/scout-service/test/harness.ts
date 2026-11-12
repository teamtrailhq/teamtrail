/** A Scout service on this machine with an in-memory store, a fake Slack, and helpers to install and connect. */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createService, type ScoutService } from '../src/createService';
import { MemoryStore } from '../src/store/MemoryStore';
import type { ServiceConfig } from '../src/types';
import type { Json } from './client';
import { fakeSlack, type FakeSlack } from './fakes/fakeSlack';

export const SIGNING_SECRET = 'test-signing-secret';
export const RETURN = 'http://127.0.0.1:7499/?settings=slack';

export interface World {
  base: string;
  slack: FakeSlack;
  service: ScoutService;
  store: MemoryStore;
  logs: { event: string; fields?: Record<string, unknown> }[];
  /** The service's clock: `Date.now()` moved by `clock.offset` ms. */
  clock: { offset: number };
  now(): number;
  close(): Promise<void>;
}

export async function world(): Promise<World> {
  const slack = await fakeSlack();
  const clock = { offset: 0 };
  const now = () => Date.now() + clock.offset;
  const store = new MemoryStore();
  const logs: World['logs'] = [];
  const config: ServiceConfig = {
    port: 0,
    publicUrl: 'https://scout.test',
    slackClientId: 'client-id',
    slackClientSecret: 'client-secret',
    slackSigningSecret: SIGNING_SECRET,
    tokenKey: randomBytes(32),
    trustProxy: false,
    databaseSsl: 'off',
    slackApiUrl: `${slack.url}/api`,
    slackAuthorizeUrl: 'https://slack.test/oauth/v2/authorize',
    slackHooksOrigin: slack.url,
  };
  const service = createService({ config, store, now, log: (event, fields) => logs.push({ event, fields }) });
  await new Promise<void>((r) => service.server.listen(0, '127.0.0.1', r));
  const { port } = service.server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    slack,
    service,
    store,
    logs,
    clock,
    now,
    async close() {
      await service.close();
      await slack.close();
    },
  };
}

export const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

export function slackAnswer(o: { team: string; user: string; token?: string }) {
  return {
    ok: true,
    access_token: o.token ?? `xoxb-${o.team}-secret`,
    token_type: 'bot',
    scope: 'commands,chat:write',
    bot_user_id: `B${o.team}`,
    team: { id: o.team, name: `Team ${o.team}` },
    authed_user: { id: o.user },
  };
}

/** /install → Slack's callback: the address the browser is sent back to. */
export async function installTo(w: World, o: { team: string; user: string; challenge: string; code?: string }) {
  const start = await fetch(`${w.base}/install?challenge=${o.challenge}&return=${encodeURIComponent(RETURN)}`, {
    redirect: 'manual',
  });
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  const code = o.code ?? `code-${o.team}-${o.user}`;
  w.slack.installs.set(code, slackAnswer(o));
  const back = await fetch(`${w.base}/oauth/callback?code=${code}&state=${state}`, { redirect: 'manual' });
  return back.headers.get('location') ?? '';
}

export async function postLink(w: World, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${w.base}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Json };
}

/** A full install and link: the link token a Lookout would keep. */
export async function linked(w: World, o: { team: string; user: string }) {
  const { verifier, challenge } = pkce();
  const back = await installTo(w, { ...o, challenge });
  const code = new URL(back).hash.replace('#slack-link=', '');
  const r = await postLink(w, { code, verifier });
  return { token: r.body.link.token as string, id: r.body.link.id as string };
}

/** A signed request to one of Slack's URLs. */
export async function fromSlack(w: World, o: { path: string; body: string; form?: boolean; at?: number }) {
  const ts = String(Math.floor((o.at ?? w.now()) / 1000));
  const sig = `v0=${createHmac('sha256', SIGNING_SECRET).update(`v0:${ts}:${o.body}`).digest('hex')}`;
  const res = await fetch(`${w.base}${o.path}`, {
    method: 'POST',
    headers: {
      'Content-Type': o.form ? 'application/x-www-form-urlencoded' : 'application/json',
      'X-Slack-Request-Timestamp': ts,
      'X-Slack-Signature': sig,
    },
    body: o.body,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

export { connect, type Client } from './client';
