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
 * Skipping discovery is the trail lead's call: the agent asks about it (`about: skip-discovery`) and the trail lead
 * says yes through the Lookout's own answer route, from the browser's session. Returns the questionId to pass to
 * start_trail. `project` is the id of a repo other than the Lookout's home one.
 */
export async function skipDiscoveryInLookout({ call, page, url, project }) {
  const api = (p) => new URL(`__teamtrail${project ? `/p/${project}` : ''}${p}`, url).href;
  const asked = call('ask_human', {
    question: 'Skip discovery for this trail?',
    about: { kind: 'skip-discovery' },
    framing: true,
    waitSeconds: 60,
  });
  for (let i = 0; i < 300; i++) {
    const { sessions } = await (await page.request.get(api('/agents'))).json();
    for (const d of sessions) {
      const q = d.pending.find((p) => (p.stakes ?? '').includes('skip discovery'));
      if (!q) continue;
      const r = await page.request.post(api('/agents/answer'), {
        data: { sessionId: d.session.id, questionId: q.id, text: 'Yes, skip it' },
      });
      if (!r.ok()) throw new Error(`answer refused: ${r.status()} ${await r.text()}`);
      return (await asked).questionId;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the question about skipping discovery never reached the Lookout');
}
