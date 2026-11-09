// Linear steps of the end-to-end check (verify-mcp.mjs), against the fake Linear GraphQL API from the core tests
// (packages/core/test/fakes/linear.ts) served over HTTP, with a key in LINEAR_API_KEY: onboarding says whose key it
// is before anything connects, the picker lists the teams the key can access with none picked (there are several),
// a team the key can't read is refused without switching, and the team picked instead is saved for this project and
// shown in Settings → Tracker. No response carries the key.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const KEY = 'lin_api_e2e_never_shown_5b1c';

/** The core test fake, bundled for plain node and served on a free port. */
async function serveFake(top) {
  const out = path.join(top, 'fake-linear.mjs');
  await build({
    entryPoints: [path.resolve(here, '../packages/core/test/fakes/linear.ts')],
    outfile: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'warning',
  });
  const { fakeLinear } = await import(pathToFileURL(out).href);
  const ln = fakeLinear({
    apiKey: KEY,
    viewer: { name: 'Ada Ops', email: 'ada@octo.dev' },
    org: 'Octo Inc',
    teams: [
      { id: 'team-design', key: 'DES', name: 'Design', activeAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
      { id: 'team-archive', key: 'ARC', name: 'Archive', unreadable: true },
    ],
  });
  const server = http.createServer(async (req, res) => {
    // Only Linear lives here; GitHub calls get a plain 404.
    if (req.method !== 'POST' || req.url !== '/graphql') return void res.writeHead(404).end('{}');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString('utf8') || undefined;
    const r = await ln.fetch(`http://fake${req.url}`, { method: req.method, headers: req.headers, body });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/graphql` };
}

async function startLookout(cli, cwd, env) {
  const server = spawn(process.execPath, [cli, '--no-open', '--port', '0'], { cwd, env });
  const url = await new Promise((resolve, reject) => {
    let out = '';
    server.stdout.on('data', (c) => {
      out += c;
      const m = out.match(/Lookout\s+(http:\S+)/);
      if (m) resolve(m[1]);
    });
    server.on('exit', (code) => reject(new Error(`teamtrail exited ${code}: ${out}`)));
  });
  return { server, url };
}

export async function verifyLinear({ browser, cli, log, shots }) {
  const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-linear-e2e-')));
  const repo = path.join(top, 'launchpad');
  fs.mkdirSync(path.join(repo, '.teamtrail'), { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const fake = await serveFake(top);
  const env = {
    ...process.env,
    TEAMTRAIL_CONFIG_DIR: path.join(top, 'config'),
    TEAMTRAIL_LINEAR_API: fake.url,
    LINEAR_API_KEY: KEY,
    // GitHub never reaches the real API or the person's gh login here.
    TEAMTRAIL_GITHUB_API: fake.url,
    GITHUB_TOKEN: 'gho_unused_in_linear_steps',
  };
  delete env.GH_TOKEN;
  const { server, url } = await startLookout(cli, repo, env);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const api = async (p) => (await fetch(new URL(`__teamtrail${p}`, url))).text();
  try {
    await page.goto(url);
    const dialog = page.locator('.dialog.onboarding');
    const choice = dialog.locator('.choice', { hasText: 'Linear' });
    await choice
      .getByText('Will use the team you pick in Octo Inc as Ada Ops (LINEAR_API_KEY)')
      .waitFor({ timeout: 15_000 });
    await choice.click();
    const rows = dialog.locator('.team-row');
    await rows.first().waitFor({ timeout: 15_000 });
    const first = await rows.first().innerText();
    const listed = await rows.count();
    const prompted = await dialog.getByText('Pick the team your trails go in').isVisible();
    const connect = dialog.locator('.linear-setup').getByRole('button', { name: 'Connect', exact: true });
    const disabledFirst = await connect.isDisabled();
    const onChoice = JSON.parse(await api('/trackers')).active;
    if (shots) await page.screenshot({ path: path.join(shots, '22-linear-picker.png') });

    // A team the key can list but not read is refused, and nothing switches.
    await rows.filter({ hasText: 'Archive' }).locator('.ds-row-main').click();
    await connect.click();
    await dialog.getByText("This Linear key can't read that team").waitFor({ timeout: 15_000 });
    const afterRefusal = JSON.parse(await api('/trackers')).active;

    // The team picked instead connects, is saved for this project and shown in Settings.
    await dialog.getByLabel('Search teams').fill('eng');
    await rows.filter({ hasText: 'Engineering' }).locator('.ds-row-main').click();
    await dialog.getByText('Will use Engineering in Octo Inc as Ada Ops (LINEAR_API_KEY)').waitFor();
    await connect.click();
    await dialog.waitFor({ state: 'detached', timeout: 20_000 });
    await page.goto(`${url}?settings=tracker`);
    await page.locator('.settings-page').waitFor({ timeout: 15_000 });
    const who = page.locator('.connector .c-who');
    await who.waitFor({ timeout: 15_000 });
    const whoText = await who.innerText();
    if (shots) await page.screenshot({ path: path.join(shots, '23-linear-settings.png') });
    const saved = JSON.parse(fs.readFileSync(path.join(repo, '.teamtrail', 'trackers.json'), 'utf8'));
    const responses = [
      await api('/trackers'),
      await api('/trackers/linear/teams'),
      await api('/trackers/linear/projects?team=team-eng'),
    ];
    const leaked = responses.some((t) => t.includes(KEY));

    const ok =
      first.includes('Design') &&
      listed === 3 &&
      prompted &&
      disabledFirst &&
      onChoice === 'markdown' &&
      afterRefusal === 'markdown' &&
      saved.linear?.teamId === 'team-eng' &&
      saved.linear?.orgName === 'Octo Inc' &&
      whoText === 'Connected to Engineering in Octo Inc as Ada Ops, using LINEAR_API_KEY' &&
      !leaked &&
      !errors.length;
    log(
      `linear picker ${ok ? 'ok' : 'WRONG'}: choosing Linear left the tracker ${onChoice}, ${listed} teams listed with "${first.split('\n')[0]}" first, none picked (${prompted && disabledFirst}), unreadable team refused (still ${afterRefusal}), saved ${saved.linear?.teamKey} in ${saved.linear?.orgName}, Settings says "${whoText}", key in responses: ${leaked}${errors.length ? `; page errors: ${errors.join(' | ')}` : ''}`,
    );
    return ok;
  } finally {
    await page.close();
    server.kill('SIGTERM');
    fake.server.close();
    if (!process.env.KEEP) fs.rmSync(top, { recursive: true, force: true });
  }
}
