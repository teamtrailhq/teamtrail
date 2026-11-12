/**
 * Slack and the Scout service on this machine, for driving the Lookout in a browser and for the end-to-end check:
 *
 *   node test/run.mjs serve 7499
 *   TEAMTRAIL_SCOUT_SERVICE=http://127.0.0.1:7500 npm run dev     (or the built teamtrail)
 *
 * The fake Slack answers on <port>, the real Scout service (in memory) on <port + 1> (port 0: any two free ports;
 * both addresses are printed). Add Scout to Slack goes
 * through the fake consent screen at once, as ANA (`POST /control/state {"oauthUser": "U0RAJ0001"}` to change who).
 * People in Slack are simulated with `POST /control/<payload builder>` and a JSON array of arguments, e.g.
 * `curl -XPOST 127.0.0.1:7499/control/homeOpened -d '["U0ANA0001"]'`: the payload is signed and sent to the
 * service as Slack would, and the service's answer comes back as `ack`. `GET /control/messages?channel=D00ANA0001`
 * lists what Scout posted, `GET /control/responses` what was posted to response URLs, `GET /control/ephemerals` what only one person saw.
 */
import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import { createService } from '../../../apps/scout-service/src/createService';
import { MemoryStore } from '../../../apps/scout-service/src/store/MemoryStore';
import { fakeSlack } from './fakes/slack';

const port = Number(process.argv[2] ?? 7499);
const SIGNING_SECRET = 'fake-signing-secret';
const fake = fakeSlack({ start: Date.now() });

const listen = (s: http.Server, p: number) =>
  new Promise<string>((resolve) =>
    s.listen(p, '127.0.0.1', () => resolve(`http://127.0.0.1:${(s.address() as { port: number }).port}`)),
  );

let origin = '';
let serviceOrigin = '';
const server = http.createServer((req, res) => void handle(req, res));
origin = await listen(server, port);
const service = createService({
  config: {
    port: port && port + 1,
    // Set once the service listens, before any request: Slack's redirect address and the install page use it.
    publicUrl: '',
    slackClientId: 'fake-client-id',
    slackClientSecret: 'fake-client-secret',
    slackSigningSecret: SIGNING_SECRET,
    tokenKey: randomBytes(32),
    trustProxy: false,
    databaseSsl: 'off',
    slackApiUrl: `${origin}/api`,
    slackAuthorizeUrl: `${origin}/oauth/v2/authorize`,
    slackHooksOrigin: origin,
  },
  store: new MemoryStore(),
  log: () => {},
});

const read = (req: http.IncomingMessage) =>
  new Promise<string>((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

/** Slack's request to the service: the route, the body as Slack encodes it for that route, and its signature. */
function signed(type: string, payload: Record<string, unknown>) {
  const raw = JSON.stringify(payload).replaceAll('https://hooks.slack.test', `${origin}/hooks`);
  const form = 'application/x-www-form-urlencoded';
  const routes: Record<string, [string, string, string]> = {
    interactive: ['interactions', `payload=${encodeURIComponent(raw)}`, form],
    slash_commands: ['commands', new URLSearchParams(JSON.parse(raw) as Record<string, string>).toString(), form],
    events_api: ['events', raw, 'application/json'],
  };
  const [route, body, contentType] = routes[type];
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = `v0=${createHmac('sha256', SIGNING_SECRET).update(`v0:${ts}:${body}`).digest('hex')}`;
  const headers = { 'content-type': contentType, 'x-slack-request-timestamp': ts, 'x-slack-signature': sig };
  return { url: `${serviceOrigin}/slack/${route}`, body, headers };
}

async function asSlack(builder: keyof typeof fake.payload, args: unknown[]) {
  const build = fake.payload[builder] as (...a: unknown[]) => { type: string; payload: Record<string, unknown> };
  const e = build(...args);
  const r = signed(e.type, e.payload);
  const res = await fetch(r.url, { method: 'POST', headers: r.headers, body: r.body });
  const text = await res.text();
  return { status: res.status, ack: text ? (JSON.parse(text) as unknown) : null };
}

async function api(req: http.IncomingMessage, res: http.ServerResponse, url: URL, body: string) {
  const r = await fake.fetch(`https://slack.test${url.pathname}${url.search}`, {
    method: req.method,
    headers: {
      authorization: req.headers.authorization ?? '',
      'content-type': req.headers['content-type'] ?? 'application/json',
    },
    body: body || undefined,
  });
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(await r.text());
}

/** Slack's consent screen, clicked through at once: back to the service with a code and the state it sent. */
function authorize(res: http.ServerResponse, url: URL) {
  const back = new URL(url.searchParams.get('redirect_uri') ?? `${serviceOrigin}/oauth/callback`);
  back.searchParams.set('code', 'fake-oauth-code');
  back.searchParams.set('state', url.searchParams.get('state') ?? '');
  res.writeHead(302, { location: back.toString() });
  res.end();
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? '/', origin);
  const body = await read(req);
  if (url.pathname.startsWith('/api/')) return api(req, res, url, body);
  if (url.pathname === '/oauth/v2/authorize') return authorize(res, url);
  if (url.pathname.startsWith('/hooks/')) {
    fake.responses.push({ url: url.pathname, body: JSON.parse(body || '{}') });
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/control/messages') {
    const c = fake.channels.get(url.searchParams.get('channel') ?? '');
    return json(res, c ? 200 : 404, c ? c.messages : { error: 'channel_not_found' });
  }
  if (url.pathname === '/control/responses') return json(res, 200, fake.responses);
  if (url.pathname === '/control/ephemerals') return json(res, 200, fake.ephemerals);
  if (url.pathname === '/control/state' && req.method === 'POST') {
    Object.assign(fake.state, JSON.parse(body || '{}'));
    return json(res, 200, fake.state);
  }
  if (url.pathname === '/control/post' && req.method === 'POST') {
    const [channel, user, text, thread] = JSON.parse(body) as string[];
    return json(res, 200, { ts: fake.human.post(channel, user, text, thread) });
  }
  const builder = url.pathname.match(/^\/control\/(\w+)$/)?.[1] as keyof typeof fake.payload | undefined;
  if (builder && builder in fake.payload && req.method === 'POST')
    return json(res, 200, await asSlack(builder, JSON.parse(body || '[]') as unknown[]));
  json(res, 404, { error: 'not_found' });
}

serviceOrigin = await listen(service.server, port && port + 1);
service.ctx.config.publicUrl = serviceOrigin;
process.stdout.write(
  `fake Slack on ${origin}\nScout service on ${serviceOrigin}\n  TEAMTRAIL_SCOUT_SERVICE=${serviceOrigin}\n`,
);
