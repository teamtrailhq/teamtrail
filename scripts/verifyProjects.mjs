// M5 steps of the end-to-end check (verify-mcp.mjs): one Lookout supervising two repos. Each repo has its own MCP
// agent, which registers its repo on start and asks a blocking question. All projects shows both projects and both
// questions ranked together; answering repo B's question there reaches the agent in repo B. Uses its own config dir,
// never the user's. Waits on what the user sees, never on sleeps.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { approveSkipInLookout, lookoutLinks, signInWith } from './e2eHelpers.mjs';

function repo(top, name) {
  const dir = path.join(top, name);
  fs.mkdirSync(path.join(dir, '.teamtrail'), { recursive: true });
  return dir;
}

async function startServer(cli, cwd, env) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd, env });
  const { url, pair } = await new Promise((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (c) => {
      out += c;
      const links = lookoutLinks(out);
      if (links) resolve(links);
    });
    server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
  });
  return { server, url, pair };
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
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
    if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };
  return { client, call };
}

export async function verifyProjects({ browser, cli, log, shots }) {
  const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-projects-e2e-')));
  const config = path.join(top, 'config');
  const env = { ...process.env, TEAMTRAIL_CONFIG_DIR: config };
  delete env.TEAMTRAIL_NO_REGISTER;
  const a = repo(top, 'storefront');
  const b = repo(top, 'billing');
  const { server, url, pair } = await startServer(cli, a, env);
  const one = await agent(cli, a, env);
  const two = await agent(cli, b, env);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const askA = one.call('ask_human', { question: 'Show prices with tax?', urgency: 'blocking', waitSeconds: 90 });
    const askB = two.call('ask_human', { question: 'Round partial units up?', urgency: 'blocking', waitSeconds: 90 });
    const registered = JSON.parse(fs.readFileSync(path.join(config, 'projects.json'), 'utf8')).projects.map(
      (p) => p.name,
    );

    await signInWith(page, pair);
    await page.goto(`${url}?projects`);
    await page.locator('.dialog.onboarding').waitFor();
    await page.getByRole('button', { name: 'Get started' }).click();
    const cards = page.locator('.projects-view .project-card');
    await page.locator('.projects-view .pj-item.k-question').nth(1).waitFor({ timeout: 20_000 });
    const cardCount = await cards.count();
    const queue = await page.locator('.projects-view .pj-item.k-question .ds-row-context').allTextContents();
    const both = ['storefront', 'billing'].every((n) => queue.some((t) => t.includes(n)));
    if (shots) await page.screenshot({ path: path.join(shots, '17-all-projects.png') });

    const itemB = page.locator('.projects-view .pj-item', { hasText: 'Round partial units up?' });
    await itemB.locator('textarea').fill('Yes, always up');
    await itemB.getByRole('button', { name: 'Answer' }).click();
    const answeredB = await askB;
    await itemB.waitFor({ state: 'detached', timeout: 20_000 });
    const switcher = await page.locator('.project-switcher').count();
    const visited = [];
    page.on('framenavigated', (f) => f === page.mainFrame() && visited.push(f.url()));

    // A ticket item from another project: it opens that project with the ticket selected in the inspector.
    // Skipping discovery is a request the trail lead approves: here through billing's own API, as its Lookout would.
    await approveSkipInLookout({
      started: await two.call('start_trail', {
        discovery: false,
        title: 'Usage invoices',
        destination: 'Invoices explain every line',
        tickets: [{ ref: 'cur', title: 'Which currency ships first?', type: 'junction' }],
      }),
      page,
      url,
      project: 'billing',
    });
    const ticketItem = page.locator('.projects-view .pj-item', { hasText: 'Which currency ships first?' });
    await ticketItem.locator('.ds-row-main').click({ timeout: 20_000 });
    await page.locator('.inspector', { hasText: 'Which currency ships first?' }).waitFor({ timeout: 20_000 });
    await page.locator('.header .repo', { hasText: 'billing' }).waitFor({ timeout: 15_000 });
    const ticketLink = visited.find((u) => /[?&]project=[0-9a-f]+/.test(u) && /[?&]item=/.test(u)) ?? '';
    const ticketOpened = !!ticketLink && !/[?&]item=/.test(page.url());
    if (shots) await page.screenshot({ path: path.join(shots, '18-project-b.png') });

    // A question item from the home project: it opens home with that question's conversation open.
    await page.locator('.project-switcher .project-btn').click();
    await page.locator('.project-switcher .all-projects').click();
    await page.locator('.projects-view .pj-item', { hasText: 'Show prices with tax?' }).locator('.ds-row-main').click();
    await page.locator('.open-q', { hasText: 'Show prices with tax?' }).waitFor({ timeout: 20_000 });
    const questionLink = visited.at(-1) ?? '';
    const questionOpened = /[?&]item=question/.test(questionLink) && !/[?&]project=/.test(questionLink);
    await page.locator('.comms-input textarea').fill('Yes, with tax');
    await page.locator('.comms-input textarea').press('Enter');
    const answeredA = await askA;

    const ok =
      registered.includes('storefront') &&
      registered.includes('billing') &&
      cardCount === 2 &&
      both &&
      switcher === 1 &&
      ticketOpened &&
      questionOpened &&
      answeredB.answer === 'Yes, always up' &&
      answeredA.answer === 'Yes, with tax' &&
      !errors.length;
    log(
      `all projects ${ok ? 'ok' : 'WRONG'}: agents registered ${registered.join(' and ')}, ${cardCount} project rows, both questions in one queue (${both}), billing's answered from the overview ("${answeredB.answer}"), billing's ticket opened in its inspector from the queue (${ticketOpened}), storefront's question opened in its conversation from the queue (${questionOpened}) and answered there ("${answeredA.answer}")${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await one.client.close();
    await two.client.close();
    await page.close();
    server.kill('SIGTERM');
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
