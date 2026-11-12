/** Install from Slack: the direct install URL installs Scout in a workspace and links nobody. */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { slackAnswer, world, type World } from './harness';

let w: World;
beforeEach(async () => (w = await world()));
afterEach(() => w.close());

async function start() {
  const res = await fetch(`${w.base}/install-slack`, { redirect: 'manual' });
  return { res, state: new URL(res.headers.get('location')!).searchParams.get('state')! };
}

const callback = (state: string, code: string) =>
  fetch(`${w.base}/oauth/callback?code=${code}&state=${state}`, { redirect: 'manual' });

describe('/install-slack', () => {
  test('sends the browser to Slack with a fresh state, every bot scope and our callback, and sets no cookie', async () => {
    const { res, state } = await start();
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('location')!);
    expect(to.origin + to.pathname).toBe('https://slack.test/oauth/v2/authorize');
    expect(to.searchParams.get('client_id')).toBe('client-id');
    expect(to.searchParams.get('redirect_uri')).toBe('https://scout.test/oauth/callback');
    expect(to.searchParams.get('scope')).toContain('app_mentions:read');
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect((await start()).state).not.toBe(state);
  });

  test('the callback installs the workspace, links nobody, and says how to connect', async () => {
    const { state } = await start();
    w.slack.installs.set('c1', slackAnswer({ team: 'T1', user: 'U1' }));
    const res = await callback(state, 'c1');
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    const page = await res.text();
    expect(page).toContain('Scout is installed in Team T1');
    expect(page).toContain('Settings → Slack → Add Scout to Slack');
    expect(page).toContain('href="https://teamtrail.app/docs/slack/"');
    expect(await w.store.workspace('T1')).toMatchObject({ teamId: 'T1', installedBy: 'U1' });
    expect(await w.store.linksOf('T1', 'U1')).toEqual([]);
    // No link code was made: nothing a Lookout could trade for a link.
    expect((w.store as unknown as { codes: Map<string, unknown> }).codes.size).toBe(0);
  });

  test('a state is used once, and expires after ten minutes', async () => {
    const used = await start();
    w.slack.installs.set('c1', slackAnswer({ team: 'T1', user: 'U1' }));
    expect((await callback(used.state, 'c1')).status).toBe(200);
    expect((await callback(used.state, 'c1')).status).toBe(400);
    const late = await start();
    w.clock.offset += 10 * 60_000 + 1;
    w.slack.installs.set('c2', slackAnswer({ team: 'T2', user: 'U2' }));
    expect((await callback(late.state, 'c2')).status).toBe(400);
    expect(await w.store.workspace('T2')).toBeUndefined();
  });

  test('the workspace name on the page is escaped', async () => {
    const { state } = await start();
    w.slack.installs.set('c1', {
      ...slackAnswer({ team: 'T1', user: 'U1' }),
      team: { id: 'T1', name: '<script>x</script>' },
    });
    const page = await (await callback(state, 'c1')).text();
    expect(page).not.toContain('<script>x');
    expect(page).toContain('&lt;script&gt;x');
  });
});
