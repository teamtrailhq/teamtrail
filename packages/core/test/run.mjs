// Bundles the TypeScript tests with esbuild and runs them with `node --test`.
//   node test/run.mjs                 run every *.node.test.ts (the *.test.ts files are vitest's)
//   node test/run.mjs record [fake|live]   re-record fixtures (see record.ts)
//   node test/run.mjs serve [port]         fake GitHub + Linear over HTTP (see serve-fakes.ts)
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

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
const args = script ? [files[0], ...rest] : ['--test', '--enable-source-maps', ...files];
// Tests never use the credentials of whoever runs them: no `gh` login, no token from the shell.
const env = { ...process.env, TEAMTRAIL_NO_GH_CLI: '1' };
for (const k of ['GITHUB_TOKEN', 'GH_TOKEN', 'LINEAR_API_KEY']) delete env[k];
const r = spawnSync(process.execPath, args, { stdio: 'inherit', env });
process.exit(r.status ?? 1);
