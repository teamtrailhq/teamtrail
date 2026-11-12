// Slack steps of the end-to-end check (verify-mcp.mjs), on their own scratch project and config dir, against a fake
// Slack and the real Scout service in memory (packages/connector-slack/test/serve-fake.ts): Add Scout to Slack from
// Settings goes through the service and Slack's (fake) consent screen, asks "Connect as @ana in efika?" and connects; an agent's question
// is answered with a button in Slack; a high-risk question shows Open in Lookout and a Slack answer can't back a
// high-risk decision; a second agent's waited-on question gets its own message right after another question; @Scout
// in a channel and a DM to Scout are answered in place; Disconnect forgets it all. Waits on what the user sees and what the servers answer, never sleeps.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { approveSkipInLookout, lookoutLinks, shootThemes, signInWith } from './e2eHelpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ANA = 'U0ANA0001';
const DM = 'D00ANA0001';

/** Starts a process and resolves with it once its output matches `ready`. */
function started(cmd, args, o, ready) {
  const proc = spawn(cmd, args, o);
  return new Promise((resolve, reject) => {
    let out = '';
    const read = (c) => {
      out += c;
      const m = ready(out);
      if (m) resolve({ proc, ...m });
    };
    proc.stdout.on('data', read);
    proc.stderr.on('data', read);
    proc.on('exit', (code) => reject(new Error(`${args.join(' ')} exited ${code}: ${out}`)));
  });
}

async function until(what, ok, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await ok();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const caller =
  (client) =>
  async (tool, args = {}) => {
    const r = await client.callTool({ name: tool, arguments: args });
    if (r.isError) throw new Error(`${tool}: ${r.content[0].text}`);
    return JSON.parse(r.content[0].text);
  };

const refusal = (p) =>
  p.then(
    () => '',
    (e) => e.message,
  );

export async function verifySlack({ browser, cli, log, shots }) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-slack-e2e-'));
  fs.mkdirSync(path.join(top, '.teamtrail'));
  const config = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-slack-e2e-config-'));
  const fake = await started(
    process.execPath,
    [path.resolve(here, '../packages/connector-slack/test/run.mjs'), 'serve', '0'],
    // its own process group: run.mjs builds the fake, then runs it as a child, and both stop together
    { env: { ...process.env }, detached: true },
    (out) => {
      const slack = out.match(/fake Slack on (http:\S+)/)?.[1];
      const service = out.match(/Scout service on (http:\S+)/)?.[1];
      return slack && service ? { slack, service } : null;
    },
  );
  const env = { ...process.env, TEAMTRAIL_CONFIG_DIR: config, TEAMTRAIL_SCOUT_SERVICE: fake.service };
  const lookout = await started(process.execPath, [cli, '--no-open', '--port', '0'], { cwd: top, env }, lookoutLinks);
  const control = (p, body) =>
    fetch(`${fake.slack}/control/${p}`, body ? { method: 'POST', body: JSON.stringify(body) } : {}).then((r) =>
      r.json(),
    );
  const messages = () => control(`messages?channel=${DM}`).then((m) => (Array.isArray(m) ? m : []));
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const closers = [];
  try {
    await signInWith(page, lookout.pair);

    // Add Scout to Slack: through the service and Slack's consent screen, back to Settings → Slack, connected.
    await page.goto(`${lookout.url}?settings=slack`);
    await page.locator('.dialog.onboarding').waitFor();
    await page.getByRole('button', { name: 'Get started' }).click();
    const card = page.locator('.slack-settings');
    await card.getByRole('button', { name: 'Add Scout to Slack' }).click();
    // Back from Slack: nothing is saved until the trail lead has seen whose account it is.
    await card.getByText(/Connect as @ana in efika\?/).waitFor({ timeout: 20_000 });
    await shootThemes(page, shots, '39-slack-confirm');
    const credsFile = path.join(config, 'credentials.json');
    const savedEarly = fs.existsSync(credsFile) && !!JSON.parse(fs.readFileSync(credsFile, 'utf8')).slack;
    await card.getByRole('button', { name: 'Connect', exact: true }).click();
    await card.getByText('Online').waitFor({ timeout: 20_000 });
    await card.locator('.sl-owner').getByText('@ana').waitFor({ timeout: 15_000 });
    const address = page.url();
    await shootThemes(page, shots, '40-slack-connected');
    const greeted = await until('the greeting', async () =>
      (await messages()).find((m) => m.text.startsWith('Connected.')),
    );
    const creds = JSON.parse(fs.readFileSync(path.join(config, 'credentials.json'), 'utf8'));

    // An agent asks; the owner answers with a button in Slack; the agent gets the answer, labelled Slack.
    const agent = new Client({ name: 'claude-code', version: '2.1.0' });
    await agent.connect(
      new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], cwd: top, stderr: 'pipe', env }),
    );
    closers.push(() => agent.close());
    const call = caller(agent);
    const trail = await approveSkipInLookout({
      started: await call('start_trail', {
        discovery: false,
        title: 'Event store',
        destination: 'A durable event store',
        tickets: [{ ref: 'db', title: 'Pick the database', type: 'research' }],
      }),
      page,
      url: lookout.url,
    });
    await call('claim_ticket', { ticket: trail.tickets[0].key });
    const asked = await call('ask_human', {
      question: 'Postgres or SQLite for the event store?',
      suggestions: ['Postgres', 'SQLite'],
      urgency: 'blocking',
      waitSeconds: 0,
    });
    const ask = await until('the question in Slack', async () =>
      (await messages()).find((m) => m.text.includes('Postgres or SQLite')),
    );
    const clicked = await control('click', [ANA, DM, ask.ts, 'ask_option:0']);
    const got = await call('wait_for_answer', { questionId: asked.questionId, waitSeconds: 20 });

    // A high-risk question: Open in Lookout, no answer buttons; a Slack answer backs no high-risk decision.
    await call('ask_human', {
      question: 'Drop the old events table?',
      category: 'schema',
      urgency: 'blocking',
      waitSeconds: 0,
    });
    const high = await until('the high-risk question in Slack', async () =>
      (await messages()).find((m) => m.text.includes('Drop the old events table')),
    );
    const highButtons = high.blocks
      .filter((b) => b.type === 'actions')
      .flatMap((b) => b.elements.map((e) => e.text.text));
    const highRefused = await refusal(
      call('record_decision', {
        question: 'Postgres or SQLite?',
        answer: 'Postgres',
        category: 'schema',
        questionId: asked.questionId,
      }),
    );
    const ordinary = await call('record_decision', {
      question: 'Postgres or SQLite?',
      answer: 'Postgres',
      questionId: asked.questionId,
    });

    // Two questions from one agent, the second waited on: the second still gets its own message with buttons.
    const second = new Client({ name: 'codex', version: '1.0.0' });
    await second.connect(
      new StdioClientTransport({ command: process.execPath, args: [cli, 'mcp'], cwd: top, stderr: 'pipe', env }),
    );
    closers.push(() => second.close());
    const call2 = caller(second);
    await call2('resume_trail', { trail: trail.trail.id });
    await call2('ask_human', {
      question: 'Purge events older than a year?',
      category: 'data-deletion',
      urgency: 'blocking',
      waitSeconds: 0,
    });
    const waiting = call2('ask_human', {
      question: 'Keep event payloads as JSON?',
      suggestions: ['JSON', 'Binary'],
      urgency: 'blocking',
      waitSeconds: 30,
    });
    const own = await until('the waited-on question as its own message', async () =>
      (await messages()).find(
        (m) => m.text.includes('Keep event payloads') && m.blocks?.some((b) => b.type === 'actions'),
      ),
    );
    await control('click', [ANA, DM, own.ts, 'ask_option:0']);
    const waited = await waiting;

    // @Scout in a channel answers in its thread; a DM to Scout answers in the DM. Read-only: no answer buttons.
    const CHANNEL = 'C0INFRA01';
    await control('mention', [ANA, CHANNEL, 'inbox']);
    const inThread = await until('the reply to @Scout inbox', async () =>
      (await control(`messages?channel=${CHANNEL}`)).find((m) => m.thread_ts && /waiting on you/.test(m.text)),
    );
    const mentionButtons = JSON.stringify(inThread.blocks ?? []);
    await control('dm', [ANA, 'hello']);
    const dmHelp = await until('the reply to a DM', async () =>
      (await messages()).find((m) => m.text.includes('@Scout inbox')),
    );

    // Disconnect: revoked at the service, forgotten here.
    await page.goto(`${lookout.url}?settings=slack`);
    await card.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await card.getByRole('button', { name: 'Disconnect and forget Slack settings' }).click();
    await card.getByRole('button', { name: 'Add Scout to Slack' }).waitFor({ timeout: 15_000 });
    await page.setViewportSize({ width: 390, height: 844 });
    if (shots) await page.screenshot({ path: path.join(shots, '41-slack-disconnected-phone.png') });
    const after = JSON.parse(fs.readFileSync(path.join(config, 'credentials.json'), 'utf8'));
    const journal = fs
      .readFileSync(path.join(top, '.teamtrail', '.events', '_slack.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).action);

    const ok =
      !savedEarly &&
      !address.includes('slack-link') &&
      !!greeted &&
      /^stl_/.test(creds.slack?.link?.token ?? '') &&
      clicked.status === 200 &&
      got.answered &&
      got.answer === 'Postgres' &&
      got.answeredVia === 'slack' &&
      highButtons.join() === 'Open in Lookout' &&
      /answered in Slack, and this decision is high risk/.test(highRefused) &&
      ordinary.decision.decidedBy === `slack:${ANA}` &&
      waited.answered &&
      waited.answer === 'JSON' &&
      !!inThread &&
      !/"action_id":"(ask_option|answer|reply)/.test(mentionButtons) &&
      !!dmHelp &&
      !after.slack &&
      journal.join() === 'connected,disconnected' &&
      !errors.length;
    log(
      `Slack ${ok ? 'ok' : 'WRONG'}: Add Scout to Slack asked "Connect as @ana in efika?" (nothing saved before: ${!savedEarly}), then connected (owner @ana, greeted ${!!greeted}, code gone from the address ${!address.includes('slack-link')}); ` +
        `a button in Slack answered the agent ("${got.answer}", via ${got.answeredVia}); the high-risk question shows ${highButtons.join(', ')}; ` +
        `a Slack answer refused for a high-risk decision (${!!highRefused}) and kept for an ordinary one (${ordinary.decision.decidedBy}); ` +
        `two questions from one agent, the waited-on one posted with buttons and answered "${waited.answer}"; ` +
        `@Scout inbox answered in its thread, the DM answered with help (${!!dmHelp}); ` +
        `Disconnect forgot the link (${!after.slack}); journal ${journal.join(' → ')}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    for (const close of closers.reverse()) await Promise.resolve(close()).catch(() => undefined);
    await page.close();
    lookout.proc.kill('SIGTERM');
    process.kill(-fake.proc.pid, 'SIGTERM');
    if (!process.env.KEEP) {
      fs.rmSync(top, { recursive: true, force: true });
      fs.rmSync(config, { recursive: true, force: true });
    }
  }
}
