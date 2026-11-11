// Small helpers shared by the tracker steps of the end-to-end check (verifyGitHub.mjs, verifyLinear.mjs).
import path from 'node:path';

/**
 * Holds a fake's responses on purpose, so a step can see the page's loading state and then let the answer through:
 * `const release = gate.hold('/user/repos')`, then `await gate.pass(req.url)` in the fake server, then `release()`.
 * Waits on state, never on time.
 */
export function responseGate() {
  const held = new Map();
  return {
    hold(match) {
      let release;
      const until = new Promise((r) => (release = r));
      held.set(match, until);
      return () => {
        held.delete(match);
        release();
      };
    },
    async pass(text) {
      for (const [match, until] of held) if (text.includes(match)) await until;
    },
  };
}

/** One screenshot per theme, `<name>-night.png` and `<name>-day.png`, leaving the page's theme as it was. */
export async function shootThemes(page, dir, name) {
  if (!dir) return;
  const was = await page.evaluate(() => document.documentElement.dataset.theme ?? '');
  for (const theme of ['night', 'day']) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    await page.screenshot({ path: path.join(dir, `${name}-${theme}.png`) });
  }
  await page.evaluate((t) => {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }, was);
}

/**
 * Skipping discovery is the trail lead's call: `start_trail` with `discovery: false` returns a request, and the trail
 * lead approves it with the calls the Lookout's Approve button makes (the request as shown, by its hash), from the
 * browser's session. `project` is the name of a repo other than the Lookout's home one. verify-mcp clicks the button.
 */
export async function approveSkipInLookout({ started, page, url, project }) {
  const id = project
    ? (await (await page.request.get(new URL('__teamtrail/projects', url).href)).json()).projects.find(
        (p) => p.name === project,
      ).id
    : undefined;
  const api = (p) => new URL(`__teamtrail${id ? `/p/${id}` : ''}${p}`, url).href;
  const request = started.skipDiscovery?.request;
  if (!request) throw new Error('start_trail with discovery: false returned no request');
  const shown = await (await page.request.get(api(`/reroutes/${request}?map=${started.trail.id}`))).json();
  const r = await page.request.post(api('/reroutes/approve'), {
    data: { mapId: started.trail.id, id: request, hash: shown.reroute.hash },
  });
  if (!r.ok()) throw new Error(`approve refused: ${r.status()} ${await r.text()}`);
  return started;
}
