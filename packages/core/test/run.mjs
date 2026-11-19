// Bundles the TypeScript tests with esbuild and runs them with `node --test`.
//   node test/run.mjs                 run every *.node.test.ts (the *.test.ts files are vitest's)
//   node test/run.mjs record [fake|live]   re-record fixtures (see record.ts)
//   node test/run.mjs serve [port]         fake GitHub + Linear over HTTP (see serve-fakes.ts)
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { runInTemp } from '../../../scripts/runInTemp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../../node_modules/.cache/teamtrail-core-tests');
const [cmd, ...rest] = process.argv.slice(2);
const script = { record: 'record.ts', serve: 'serve-fakes.ts' }[cmd];
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
  packages: 'external',
  define: { __FIXTURES__: JSON.stringify(path.join(here, 'fixtures')) },
  logLevel: 'warning',
});

const files = entries.map((f) => path.join(out, f.replace(/\.ts$/, '.mjs')));
// A test that hangs fails by name after two minutes instead of stalling CI, and a file whose tests are done
// exits even if a socket or watcher is still closing.
const TEST_FLAGS = ['--test', '--enable-source-maps', '--test-timeout=120000', '--test-force-exit'];
const args = script ? [files[0], ...rest] : [...TEST_FLAGS, ...files];
// Tests never use the credentials or the config dir of whoever runs them: approvals, answers signed with the
// machine key, the projects registry go to a folder of this run. That folder and TMPDIR for every test (and whatever
// it starts) are the run's temp folder (scripts/runInTemp.mjs), removed at the end, also when stopped by a signal.
const CONFIG = 'config';
const env = (dir) => {
  const e = { ...process.env, TEAMTRAIL_NO_GH_CLI: '1', TEAMTRAIL_CONFIG_DIR: path.join(dir, CONFIG) };
  for (const k of ['GITHUB_TOKEN', 'GH_TOKEN', 'LINEAR_API_KEY']) delete e[k];
  mkdirSync(e.TEAMTRAIL_CONFIG_DIR);
  return e;
};
process.exit(
  await runInTemp({
    label: 'core',
    command: process.execPath,
    args,
    env,
    expected: [CONFIG],
    strict: !script,
  }),
);
