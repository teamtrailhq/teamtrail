// `npm run dev:fresh`: a first-time user, from nothing. A brand-new git repo, an empty user config dir (no projects,
// no saved tokens, no focus hours), the built CLI serving it exactly as `npx teamtrail` would, and a brand-new
// browser profile, so onboarding shows and nothing is remembered. Your real config, the dev seed and its projects
// registry are never read. A `gh` login on this machine is still found, as it would be for a real user. The CLI is
// rebuilt first when its build is older than the code (after a pull, or your edits).
// Usage: npm run dev:fresh [-- --name my-app --remote owner/repo --no-browser --keep]
//   --remote sets the repo's origin (the GitHub picker suggests it); --keep leaves the temp folder when you stop.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'packages/cli/dist/cli.js');
const args = process.argv.slice(2);
const opt = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const name = opt('--name') ?? 'my-app';
const remote = opt('--remote');
const browser = !args.includes('--no-browser');

/** The newest file under the sources the CLI bundle is built from, so a pull or an edit triggers a rebuild. */
const SOURCES = [
  'packages/core/src',
  'packages/cli/src',
  'packages/connector-slack/src',
  'packages/scout-avatar/src',
  'apps/lookout/src',
];
const newest = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .reduce((t, e) => Math.max(t, fs.statSync(path.join(e.parentPath, e.name)).mtimeMs), 0);
const built = fs.existsSync(cli) ? fs.statSync(cli).mtimeMs : 0;
if (SOURCES.some((d) => newest(path.join(repo, d)) > built)) {
  console.log(built ? 'The CLI build is older than the code; rebuilding…' : 'Building the CLI first…');
  execFileSync('npm', ['run', 'build', '-w', 'teamtrail'], { cwd: repo, stdio: 'inherit' });
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-fresh-'));
const project = path.join(root, name);
const config = path.join(root, 'config');
const profile = path.join(root, 'browser');
fs.mkdirSync(project);
fs.mkdirSync(config);

/** A small real repo: one commit, and an origin when asked, so the GitHub picker can suggest it. */
const git = (...a) => execFileSync('git', a, { cwd: project, stdio: 'ignore' });
fs.writeFileSync(path.join(project, 'README.md'), `# ${name}\n`);
git('init', '-q', '-b', 'main');
git('add', '.');
git('-c', 'user.name=Fresh Start', '-c', 'user.email=fresh@example.com', 'commit', '-qm', 'Initial commit');
if (remote) git('remote', 'add', 'origin', `https://github.com/${remote}.git`);

/** A port nobody has used, so the browser has no saved prefs for this origin either. */
const port = await new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => {
    const { port: p } = s.address();
    s.close(() => resolve(p));
  });
});
const url = `http://127.0.0.1:${port}/`;

const env = { ...process.env, TEAMTRAIL_CONFIG_DIR: config };
delete env.TEAMTRAIL_DIR;
delete env.TEAMTRAIL_NO_REGISTER;

console.log(`
  Fresh start
  Repo:    ${project}
  Config:  ${config}
  Lookout: ${url}

  Connect an agent the way a user would, in another terminal:
    cd ${project} && TEAMTRAIL_CONFIG_DIR=${config} node ${cli} connect

  Ctrl+C to stop. Everything lives in ${root}; it's removed when you stop.
`);

const server = spawn(process.execPath, [cli, '--no-open', '--port', String(port)], {
  cwd: project,
  env,
  stdio: 'inherit',
});

if (browser) openBrowser();

function openBrowser() {
  const chrome =
    process.env.CHROME ??
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
  const flags = [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', url];
  // Wait until the server answers, then open a window with its own empty profile.
  const tryOpen = (left) =>
    fetch(url)
      .then(() => spawn(chrome, flags, { stdio: 'ignore', detached: true }).unref())
      .catch(() => (left > 0 ? setTimeout(() => tryOpen(left - 1), 250) : console.log(`Open ${url} yourself.`)));
  tryOpen(40);
}

const stop = () => server.kill('SIGINT');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => {
  if (!args.includes('--keep')) fs.rmSync(root, { recursive: true, force: true });
  process.exit(code ?? 0);
});
