// Bundles the TypeScript tests with esbuild and runs them with `node --test`.
//   node test/run.mjs                 run every *.node.test.ts
//   node test/run.mjs record          re-record fixtures against the fake (see record.ts)
//   node test/run.mjs serve [port]    fake Slack (Web API + Socket Mode) over HTTP for browser runs (see serve-fake.ts)
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../../node_modules/.cache/teamtrail-slack-tests');
const [cmd, ...rest] = process.argv.slice(2);
const script = { record: 'record.ts', serve: 'serve-fake.ts' }[cmd];
const entries = script
  ? [script]
  : readdirSync(here).filter((f) => f.endsWith('.node.test.ts') && (!cmd || f.includes(cmd)));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
await build({
  entryPoints: entries.map((f) => path.join(here, f)),
  outdir: out,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: 'inline',
  external: ['ws'],
  define: { __FIXTURES__: JSON.stringify(path.join(here, 'fixtures')) },
  logLevel: 'warning',
});

const files = entries.map((f) => path.join(out, f.replace(/\.ts$/, '.mjs')));
const args = script ? [files[0], ...rest] : ['--test', '--enable-source-maps', ...files];
// Tests never use the credentials or the config dir of whoever runs them: answers are signed with the machine key
// kept there, so a run gets its own.
const env = {
  ...process.env,
  TEAMTRAIL_NO_GH_CLI: '1',
  TEAMTRAIL_CONFIG_DIR: mkdtempSync(path.join(os.tmpdir(), 'teamtrail-test-config-')),
};
for (const k of ['GITHUB_TOKEN', 'GH_TOKEN', 'LINEAR_API_KEY']) delete env[k];
const r = spawnSync(process.execPath, args, { stdio: 'inherit', env });
process.exit(r.status ?? 1);
