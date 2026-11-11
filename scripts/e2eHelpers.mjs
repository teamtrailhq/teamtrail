// Small helpers shared by the steps of the end-to-end check.
import { execFileSync } from 'node:child_process';
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
 * The Lookout's address and its one-time sign-in link, from what `teamtrail` prints when it starts; null until both
 * are out. Every step opens the Lookout with the link first, as a person does: it signs that browser in.
 */
export function lookoutLinks(out) {
  const url = out.match(/Lookout\s+(http:\S+)/)?.[1];
  const pair = out.match(/Sign in\s+(http:\S+)/)?.[1];
  return url && pair ? { url, pair } : null;
}

/** A new one-time sign-in link for the Lookout running in `cwd`, as `teamtrail pair` prints it: for a second browser. */
export function pairLink({ cli, cwd, env = process.env }) {
  const out = execFileSync(process.execPath, [cli, 'pair'], { cwd, env }).toString();
  const link = out.match(/(http:\S+#pair=\S+)/)?.[1];
  if (!link) throw new Error(`teamtrail pair printed no link: ${out}`);
  return link;
}

/**
 * Opens a sign-in link (`…#pair=<code>`) and signs the page's browser in as a person does: one click on the Lookout's
 * own page. Resolves once the Lookout has reloaded, signed in.
 */
export async function signInWith(page, link) {
  await page.goto(link);
  await page.getByRole('button', { name: 'Sign in this browser' }).click();
  await page.waitForFunction(() => !!localStorage.getItem('teamtrail.session'));
  await page.waitForLoadState('load');
}

/** The header the page's own API calls carry, for a script's direct calls through `page.request`. */
export async function sessionHeaders(page) {
  const session = await page.evaluate(() => localStorage.getItem('teamtrail.session'));
  return { 'X-Teamtrail-Session': session ?? '' };
}
