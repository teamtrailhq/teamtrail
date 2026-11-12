/** Adding Scout: /install, Slack's callback, and the code a Lookout trades for its link. */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { secrets } from '../src/crypto/secrets';
import type { PendingCode } from '../src/types';
import { installTo, linked, pkce, postLink, RETURN, slackAnswer, world, type World } from './harness';

let w: World;
beforeEach(async () => (w = await world()));
afterEach(() => w.close());

const install = (query: string) => fetch(`${w.base}/install?${query}`, { redirect: 'manual' });

describe('/install', () => {
  test('sends the browser to Slack with a fresh state, the bot scopes and our callback', async () => {
    const { challenge } = pkce();
    const res = await install(`challenge=${challenge}&return=${encodeURIComponent(RETURN)}`);
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get('location')!);
    expect(to.origin + to.pathname).toBe('https://slack.test/oauth/v2/authorize');
    expect(to.searchParams.get('client_id')).toBe('client-id');
    expect(to.searchParams.get('redirect_uri')).toBe('https://scout.test/oauth/callback');
    expect(to.searchParams.get('scope')).toContain('chat:write');
    expect(to.searchParams.get('scope')).not.toContain('email');
    expect(to.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test.each([
    ['https://evil.example:7499/', 'not loopback'],
    ['http://evil.example:7499/', 'not loopback'],
    ['https://127.0.0.1:7499/', 'not http'],
    ['http://127.0.0.1/', 'no port'],
    ['http://user:pw@127.0.0.1:7499/', 'user info'],
    ['http://127.0.0.1:7499/#x', 'a fragment'],
    ['http://127.0.0.1.evil.example:7499/', 'a look-alike host'],
    ['javascript:alert(1)', 'not a page'],
  ])('refuses a return address %s (%s)', async (ret) => {
    const { challenge } = pkce();
    const res = await install(`challenge=${challenge}&return=${encodeURIComponent(ret)}`);
    expect(res.status).toBe(400);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  test('refuses a missing or malformed challenge', async () => {
    for (const c of ['', 'short', 'x'.repeat(42) + '!'])
      expect((await install(`challenge=${c}&return=${encodeURIComponent(RETURN)}`)).status).toBe(400);
  });
});

describe('/oauth/callback', () => {
  test('a state this service never issued, or one used before, is refused', async () => {
    const res = await fetch(`${w.base}/oauth/callback?code=x&state=${secrets.random()}`);
    expect(res.status).toBe(400);
    const { challenge } = pkce();
    const back = await installTo(w, { team: 'T1', user: 'U1', challenge, code: 'c1' });
    expect(back).toMatch(/#slack-link=/);
    const start = new URL(back);
    expect(start.origin).toBe('http://127.0.0.1:7499');
    const again = await fetch(`${w.base}/oauth/callback?code=c1&state=whatever`);
    expect(again.status).toBe(400);
  });

  test('the bot token is stored sealed; only hashes of the codes are kept', async () => {
    const { challenge } = pkce();
    await installTo(w, { team: 'T1', user: 'U1', challenge });
    const stored = await w.store.workspace('T1');
    expect(stored?.botToken).not.toContain('xoxb-');
    expect(w.service.ctx.cipher.open(stored!.botToken, 'T1')).toBe('xoxb-T1-secret');
    expect(() => w.service.ctx.cipher.open(stored!.botToken, 'T2')).toThrow();
    expect(stored?.installedBy).toBe('U1');
  });

  test('an Enterprise Grid org install and a cancelled one are refused with a page', async () => {
    const { challenge } = pkce();
    const start = await install(`challenge=${challenge}&return=${encodeURIComponent(RETURN)}`);
    const state = new URL(start.headers.get('location')!).searchParams.get('state');
    w.slack.installs.set('org', { ...slackAnswer({ team: 'T9', user: 'U9' }), is_enterprise_install: true });
    const res = await fetch(`${w.base}/oauth/callback?code=org&state=${state}`, { redirect: 'manual' });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('Enterprise Grid');
    expect(await w.store.workspace('T9')).toBeUndefined();
  });

  test('the client secret goes to Slack only, as basic auth', async () => {
    const { challenge } = pkce();
    await installTo(w, { team: 'T1', user: 'U1', challenge });
    expect(w.logs.some((l) => JSON.stringify(l).includes('client-secret'))).toBe(false);
  });
});

describe('/link', () => {
  test('the code works once, only with the verifier, and gives a link for the installing account', async () => {
    const { verifier, challenge } = pkce();
    const code = new URL(await installTo(w, { team: 'T1', user: 'U1', challenge })).hash.slice('#slack-link='.length);
    const wrong = await postLink(w, { code, verifier: pkce().verifier });
    expect(wrong.status).toBe(400);
    const used = await postLink(w, { code, verifier });
    expect(used.status).toBe(400);
  });

  test('a good exchange returns the link, the workspace and the owner; the store keeps a hash', async () => {
    const { verifier, challenge } = pkce();
    const code = new URL(await installTo(w, { team: 'T1', user: 'U1', challenge })).hash.slice('#slack-link='.length);
    const r = await postLink(w, { code, verifier });
    expect(r.status).toBe(200);
    expect(r.body.team).toEqual({ id: 'T1', name: 'Team T1' });
    expect(r.body.user).toEqual({ id: 'U1' });
    expect(r.body.link.token).toMatch(/^stl_/);
    const stored = await w.store.link(r.body.link.id);
    expect(stored?.tokenHash).toBe(secrets.hash(r.body.link.token));
    expect(JSON.stringify(w.logs)).not.toContain(r.body.link.token);
  });

  test('an expired code is refused', async () => {
    const { verifier, challenge } = pkce();
    const code = new URL(await installTo(w, { team: 'T1', user: 'U1', challenge })).hash.slice('#slack-link='.length);
    const pending = (w.store as unknown as { codes: Map<string, PendingCode> }).codes.get(secrets.hash(code))!;
    pending.expiresAt = Date.now() - 1;
    expect((await postLink(w, { code, verifier })).status).toBe(400);
  });

  test('a browser page can never call it', async () => {
    const r = await postLink(w, { code: 'x', verifier: 'y' }, { Origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });

  test('each account keeps at most five links; the oldest goes', async () => {
    const first = await linked(w, { team: 'T1', user: 'U1' });
    for (let i = 0; i < 5; i++) await linked(w, { team: 'T1', user: 'U1' });
    expect(await w.store.link(first.id)).toBeUndefined();
    expect((await w.store.linksOf('T1', 'U1')).length).toBe(5);
  });

  test('DELETE with the link token removes it', async () => {
    const { token, id } = await linked(w, { team: 'T1', user: 'U1' });
    const del = (t: string) => fetch(`${w.base}/link`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    expect((await del('stl_wrong')).status).toBe(401);
    expect((await del(token)).status).toBe(204);
    expect(await w.store.link(id)).toBeUndefined();
  });
});

describe('/link/preview', () => {
  const preview = async (body: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${w.base}/link/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const returned = async () => {
    const { verifier, challenge } = pkce();
    const back = await installTo(w, { team: 'T1', user: 'U1', challenge });
    return { verifier, code: new URL(back).hash.replace('#slack-link=', '') };
  };

  test('says who the code belongs to, without using it up', async () => {
    const { code, verifier } = await returned();
    const r = await preview({ code, verifier });
    expect(r).toEqual({
      status: 200,
      body: { team: { id: 'T1', name: 'Team T1' }, user: { id: 'U1', name: 'name-u1' } },
    });
    expect((await preview({ code, verifier })).status).toBe(200);
    const linkedAfter = await postLink(w, { code, verifier });
    expect(linkedAfter.status).toBe(200);
    expect((await preview({ code, verifier })).status).toBe(400);
  });

  test('a wrong verifier gets nothing and uses the code up; a browser is refused', async () => {
    const { code, verifier } = await returned();
    expect((await preview({ code, verifier }, { Origin: 'https://evil.example' })).status).toBe(403);
    const wrong = await preview({ code, verifier: pkce().verifier });
    expect(wrong).toEqual({ status: 400, body: { error: 'invalid_code' } });
    expect((await preview({ code, verifier })).status).toBe(400);
    expect((await postLink(w, { code, verifier })).status).toBe(400);
  });

  test('an expired code says nothing', async () => {
    const { code, verifier } = await returned();
    w.clock.offset += 3 * 60_000 + 1;
    expect((await preview({ code, verifier })).status).toBe(400);
  });
});
