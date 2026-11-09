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
