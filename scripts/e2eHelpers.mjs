// Small helpers shared by the steps of the end-to-end check.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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
  const out = execFileSync(process.execPath, [cli, 'pair', '--no-open'], { cwd, env }).toString();
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
  // The page reloads once it has stored the session: wait for that load itself, not the one already done (a
  // `goto` started before the reload is otherwise cut short by it).
  const reloaded = page.waitForEvent('load', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Sign in this browser' }).click();
  await page.waitForFunction(() => !!localStorage.getItem('teamtrail.session'));
  await reloaded;
}

/** The header the page's own API calls carry, for a script's direct calls through `page.request`. */
export async function sessionHeaders(page) {
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('teamtrail.session') ?? '{}').secret);
  return { 'X-Teamtrail-Session': session ?? '' };
}

/**
 * Skipping discovery is the trail lead's call: `start_trail` with `discovery: false` returns a request, and the trail
 * lead approves it with the calls the Lookout's Approve button makes (the request as shown, by its hash), from the
 * browser's session. `project` is the name of a repo other than the Lookout's home one. verify-mcp clicks the button.
 */
export async function approveSkipInLookout({ started, page, url, project }) {
  const headers = await sessionHeaders(page);
  const id = project
    ? (await (await page.request.get(new URL('__teamtrail/projects', url).href, { headers })).json()).projects.find(
        (p) => p.name === project,
      ).id
    : undefined;
  const api = (p) => new URL(`__teamtrail${id ? `/p/${id}` : ''}${p}`, url).href;
  const request = started.skipDiscovery?.request;
  if (!request) throw new Error('start_trail with discovery: false returned no request');
  const shown = await (await page.request.get(api(`/reroutes/${request}?map=${started.trail.id}`), { headers })).json();
  const r = await page.request.post(api('/reroutes/approve'), {
    headers,
    data: { mapId: started.trail.id, id: request, hash: shown.reroute.hash },
  });
  if (!r.ok()) throw new Error(`approve refused: ${r.status()} ${await r.text()}`);
  return started;
}

/**
 * Takes an action on the ticket open in its bubble (or the full ticket, when open), as a person does: the bar's button
 * when it's the one on show (the primary action, Open chat), else from the bar's "⋯" menu.
 */
export async function ticketAction(page, name) {
  const drawer = page.locator('.ticket-drawer .action-bar');
  const bar = (await drawer.isVisible()) ? drawer : page.locator('.bubble .action-bar');
  const button = bar.getByRole('button', { name, exact: true });
  const shown = await button.waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false,
  );
  if (shown) return button.click();
  await bar.getByRole('button', { name: 'More ticket actions' }).click();
  await bar.getByRole('menuitem', { name, exact: true }).click();
}

/** Opens the ticket in its bubble on the map, as a person does: Fit the trail, then click its card. */
export async function clickNode(page, node) {
  await page.keyboard.press('Escape');
  await page.locator('.fit-btn').click();
  await page.waitForTimeout(500);
  await node.click();
}

/** The full ticket (the inspector), from the open bubble's "Full ticket". */
export async function openFullTicket(page) {
  await page.locator('.bubble').getByRole('button', { name: 'Full ticket' }).click();
  await page.locator('.ticket-drawer').waitFor({ timeout: 15_000 });
}

/**
 * Everything that needs you, ranked: the trail bar's More opens it in a drawer over the map. A popover: opening an item
 * from it, a press outside it or Esc closes it, and it starts closed on every load.
 */
export async function openNeedsList(page) {
  const list = page.locator('.trail-lists .needs-list');
  if (await list.isVisible()) return list;
  await page.locator('.trail-bar').getByRole('button', { name: 'More', exact: true }).click();
  await list.waitFor({ timeout: 15_000 });
  return list;
}

/** Closes the trail bar's lists if they are open, so they cover nothing a next step clicks. */
export async function closeNeedsList(page) {
  const close = page.getByRole('button', { name: 'Close the lists' });
  if (await close.isVisible()) await close.click();
}

/** Opens the most urgent thing that needs you, as the header's "N need you" does, and waits for its bubble. */
export async function openMostUrgent(page) {
  await page.locator('.needs-btn').click({ timeout: 15_000 });
  await page.locator('.bubble').waitFor({ timeout: 15_000 });
}

const COMPLETIONS = ['close_ticket', 'report_completion', 'submit_review'];

/**
 * A scripted agent that does what its guides ask: wraps a tool `call` so it remembers the guides each ticket came
 * with (claim_ticket, next_ticket, add_ticket, and guidesChanged from report_progress), and a completion that passes
 * no `checklist` answers every item of every one. A step that tests the checklist itself passes `checklist` (even
 * `[]`) and gets what it passed.
 */
export function answeringChecklists(call) {
  const byTicket = new Map();
  let working;
  const keep = (t) => {
    if (!t?.key) return;
    byTicket.set(t.key.replace(/^#/, ''), t.guides ?? []);
  };
  return async (name, args = {}) => {
    const ref = String(args.ticket ?? working ?? '').replace(/^#/, '');
    const guides = byTicket.get(ref) ?? [];
    const answers = guides.flatMap((g) => g.checklist.map((item) => ({ guide: g.id, item, done: true })));
    const filled =
      COMPLETIONS.includes(name) && args.checklist === undefined && answers.length
        ? { ...args, checklist: answers }
        : args;
    const r = await call(name, filled);
    if (name === 'claim_ticket') {
      keep(r?.claimed);
      working = r?.claimed?.key?.replace(/^#/, '');
    }
    if (name === 'next_ticket' || name === 'add_ticket') keep(r?.ticket);
    const changed = r?.guidesChanged;
    if (changed && working) {
      const kept = (byTicket.get(working) ?? []).filter((g) => !(changed.removed ?? []).includes(g.id));
      byTicket.set(working, [...kept, ...(changed.added ?? [])]);
    }
    return r;
  };
}

/**
 * Hands-on for the person whose config dir this is (their attention.json there, the rest kept): the steps written
 * for the map start on it. Everyone else starts Hands-off, the default (verifyHandsOff.mjs).
 */
export function handsOn(configDir) {
  const file = path.join(configDir, 'attention.json');
  const was = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { v: 1, channel: 'browser' };
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...was, mode: 'hands-on' }));
}
