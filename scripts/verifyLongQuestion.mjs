// A long agent question (verify-mcp.mjs), on its own scratch project and config dir: a ~200-word question with A)
// and B) paragraphs, asked once with the agent's summary and once without. Hands-off's row and Hands-on's bubble
// and Needs you list are titled by the headline (the summary, else the first sentence), the question in full sits
// under it at body size with its paragraphs, and the answer stays in reach without scrolling the bubble.
// Waits on what the user sees, never on sleeps.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { lookoutLinks, openFullTicket, openMostUrgent, openNeedsList, signInWith } from './e2eHelpers.mjs';
import { e2eTemp } from './e2eTemp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const QUESTION = fs.readFileSync(path.join(here, 'fixtures/long-question.md'), 'utf8');
const SUMMARY = 'Card images: an API key or a fixed list?';
const FIRST_SENTENCE = 'The card grid needs a picture for every card it shows.';

/** Night and day screenshots, each once the theme's colour transitions have finished (not the endless live ones). */
async function shootThemes(page, dir, name) {
  if (!dir) return;
  await page.mouse.move(1, 1);
  for (const theme of ['night', 'day']) {
    await page.evaluate(async (t) => {
      document.documentElement.dataset.theme = t;
      await new Promise((r) => requestAnimationFrame(r));
      const finite = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity);
      await Promise.all(finite.map((a) => a.finished.catch(() => undefined)));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, theme);
    await page.screenshot({ path: path.join(dir, `${name}-${theme}.png`) });
  }
  await page.evaluate(() => delete document.documentElement.dataset.theme);
}

async function startServer(cli, cwd, env) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd, env });
  const links = await new Promise((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (c) => {
      out += c;
      const found = lookoutLinks(out);
      if (found) resolve(found);
    });
    server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
  });
  return { server, ...links };
}

async function agent(cli, cwd, env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    cwd,
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'claude-code', version: '2.1.0' });
  await client.connect(transport);
  const call = async (tool, args = {}) => {
    const r = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 120_000 });
    if (r.isError) throw new Error(`${tool}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  return { client, call };
}

/** Asks the long question on the claimed ticket; the call waits for the answer. */
function ask(call, { question = QUESTION, summary } = {}) {
  const asked = call('ask_human', {
    question,
    ...(summary ? { summary } : {}),
    suggestions: ['B now, A later', 'A now'],
    urgency: 'blocking',
  });
  // closing the agent on a failed step ends the wait: that is not the failure to report
  asked.catch(() => undefined);
  return asked;
}

/** The question in full under a title: its paragraphs kept, at body size and weight, never above the title. */
async function bodyUnder(scope, titleSel) {
  const body = scope.locator('.question-body').first();
  await body.waitFor({ timeout: 15_000 });
  const paragraphs = await body.locator('p').count();
  const [title, text] = await Promise.all(
    [scope.locator(titleSel).first(), body].map((l) =>
      l.evaluate((el) => {
        const css = getComputedStyle(el);
        return { size: parseFloat(css.fontSize), weight: Number(css.fontWeight) };
      }),
    ),
  );
  return { paragraphs, smaller: text.size <= title.size && text.weight < title.weight };
}

/** Hands-off: the row titled by the headline, the question in full in its open body, both widths and themes. */
async function handsOff({ page, shots }) {
  await page.locator('.hands-off-home').waitFor({ timeout: 20_000 });
  const row = page.locator('.home-need', { has: page.locator('.home-need-title', { hasText: SUMMARY }) }).first();
  await row.waitFor({ timeout: 20_000 });
  const title = await row.locator('.home-need-title').innerText();
  if (!(await row.locator('.home-answer').isVisible())) await row.locator('.ds-row-main').click();
  const body = await bodyUnder(row, '.home-need-title');
  await shootThemes(page, shots, 'long-question-hands-off-1440');
  await page.setViewportSize({ width: 390, height: 844 });
  await row.evaluate((r) => r.scrollIntoView({ block: 'start' }));
  await shootThemes(page, shots, 'long-question-hands-off-390');
  await page.setViewportSize({ width: 1440, height: 900 });
  return title === SUMMARY && body.paragraphs >= 4 && body.smaller;
}

/** Whether the answer box shows inside the bubble without scrolling it. */
const answerInReach = (page) =>
  page.evaluate(() => {
    const bubble = document.querySelector('.bubble');
    const input = bubble?.querySelector('.bubble-answer textarea');
    if (!bubble || !input) return false;
    const b = bubble.getBoundingClientRect();
    const i = input.getBoundingClientRect();
    return bubble.scrollTop === 0 && i.bottom <= b.bottom && i.bottom <= window.innerHeight;
  });

/** Hands-on: the bubble leads with the headline, the question under it cut with Read more, the answer in reach. */
async function bubble({ page, shots, headline, shot }) {
  await openMostUrgent(page);
  const need = page.locator('.bubble .open-q');
  await need.waitFor({ timeout: 15_000 });
  await need.locator('.bubble-title', { hasText: headline }).waitFor({ timeout: 15_000 });
  const title = await need.locator('.bubble-title').innerText();
  const body = await bodyUnder(need, '.bubble-title');
  const more = await need.locator('.question-body + .d-more, .clamp .d-more').first().isVisible();
  const reach = await answerInReach(page);
  await shootThemes(page, shots, `${shot}-1440`);
  return { ok: title === headline && body.paragraphs >= 3 && body.smaller && more && reach, reach, more };
}

/** Read more opens the question whole, its options on their own lines; the full ticket's state line names it too. */
async function wholeQuestion({ page, shots }) {
  const need = page.locator('.bubble .open-q');
  await need.getByRole('button', { name: 'Read more' }).click();
  const options = await need.locator('.question-body p').evaluateAll((ps) => ps.map((p) => p.textContent.slice(0, 3)));
  await shootThemes(page, shots, 'long-question-bubble-read-more-1440');
  await need.getByRole('button', { name: 'Show less' }).click();
  await openFullTicket(page);
  const drawer = page.locator('.ticket-drawer');
  const state = await drawer.locator('.standing .state-title').innerText();
  await drawer.locator('.standing .question-body').waitFor();
  await shootThemes(page, shots, 'long-question-full-ticket-1440');
  await drawer.getByRole('button', { name: 'Close the full ticket' }).click();
  await drawer.waitFor({ state: 'detached' });
  return options.includes('A) ') && options.includes('B) ') && state === `Waiting on you: ${SUMMARY}`;
}

/** Needs you (the trail bar's More): the row titled by the headline, never the whole question. */
async function needsRow({ page, shots }) {
  const list = await openNeedsList(page);
  const row = list.locator('li.att-item.k-question').first();
  await row.waitFor({ timeout: 15_000 });
  const title = await row.locator('.ds-row-title').first().innerText();
  await shootThemes(page, shots, 'long-question-needs-row-1440');
  await page.locator('.trail-bar').getByRole('button', { name: 'Less', exact: true }).click();
  await list.waitFor({ state: 'detached', timeout: 15_000 });
  return title.trim() === SUMMARY;
}

/** The bubble on a phone: docked under the map, the answer reached by scrolling the page, not lost. */
async function phoneBubble({ page, shots }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMostUrgent(page);
  const need = page.locator('.bubble .open-q');
  await need.waitFor({ timeout: 15_000 });
  await need.locator('.bubble-answer textarea').scrollIntoViewIfNeeded();
  const shown = await need.locator('.bubble-answer textarea').isVisible();
  // the bubble from its top, under the page's header
  await need.evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -(document.querySelector('.header')?.getBoundingClientRect().bottom ?? 0) - 8);
  });
  await shootThemes(page, shots, 'long-question-bubble-390');
  await page.setViewportSize({ width: 1440, height: 900 });
  return shown;
}

export async function verifyLongQuestion({ browser, cli, log, shots }) {
  const top = e2eTemp('teamtrail-e2e-question-');
  const config = path.join(top, 'config');
  const repo = path.join(top, 'repo');
  fs.mkdirSync(path.join(repo, '.teamtrail'), { recursive: true });
  const env = { ...process.env, TEAMTRAIL_CONFIG_DIR: config };
  const { server, pair } = await startServer(cli, repo, env);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const { client, call } = await agent(cli, repo, env);
  try {
    await signInWith(page, pair);
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.locator('.dialog.onboarding').waitFor({ state: 'detached' });
    const started = await call('start_trail', {
      title: 'Card grid',
      destination: 'Every card in the grid shows a picture',
      tickets: [{ ref: 'images', title: 'Pick how cards get images', type: 'research' }],
    });
    const ticket = started.tickets.find((t) => t.title === 'Pick how cards get images').key;
    await call('claim_ticket', { ticket });

    const summed = ask(call, { summary: SUMMARY });
    const home = await handsOff({ page, shots });
    await page.locator('.mode-switch').getByRole('button', { name: 'Hands-on' }).click();
    await page.locator('.view-bar').waitFor({ timeout: 15_000 });
    const withSummary = await bubble({ page, shots, headline: SUMMARY, shot: 'long-question-bubble' });
    const whole = await wholeQuestion({ page, shots });
    const listed = await needsRow({ page, shots });
    const phone = await phoneBubble({ page, shots });
    await openMostUrgent(page);
    await page.locator('.bubble .suggest .chip', { hasText: 'B now, A later' }).click();
    const first = await summed;

    // Options on lines of their own with no blank line between them: each still starts its own line.
    const plain = ask(call, { question: QUESTION.replace('\n\nB) ', '\nB) ') });
    const without = await bubble({ page, shots, headline: FIRST_SENTENCE, shot: 'long-question-bubble-no-summary' });
    await page.locator('.bubble .open-q').getByRole('button', { name: 'Read more' }).click();
    const ownLines = (await page.locator('.bubble .question-body').innerText()).includes('\nB) Ship');
    await page.locator('.bubble .suggest .chip', { hasText: 'A now' }).click();
    const second = await plain;
    const answered = first.answer === 'B now, A later' && second.answer === 'A now';
    const ok = home && withSummary.ok && whole && listed && phone && without.ok && ownLines && answered;
    log(
      `long question ${ok ? 'ok' : 'FAILED'}: Hands-off row titled by the summary with the question in full under it (${home}), the bubble leads with the summary then the body at body size with Read more (${withSummary.ok}; answer in reach ${withSummary.reach}), read whole with its options on their own lines and in the full ticket's state line (${whole}), Needs you titled by it (${listed}), the phone bubble's answer reachable (${phone}), without a summary the first sentence (${without.ok}), options on single lines kept apart (${ownLines}), both answered (${answered})`,
    );
    return ok;
  } finally {
    await client.close();
    await page.close();
    server.kill();
    fs.rmSync(top, { recursive: true, force: true });
  }
}
