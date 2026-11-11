// `npm run dev:pair`: a new one-time sign-in link for the running dev Lookout (`npm run dev`), from the built CLI's
// `teamtrail pair`, for the same tracker folder and config dir the dev server uses. Build first:
// `npm run build -w teamtrail`.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'packages/cli/dist/cli.js');
if (!fs.existsSync(cli)) throw new Error('build the CLI first: npm run build -w teamtrail');
// as apps/lookout/vite.config.ts: $TEAMTRAIL_DIR, else .teamtrail at the repo root
const dir = path.resolve(repo, process.env.TEAMTRAIL_DIR || '.teamtrail');
const run = spawnSync(process.execPath, [cli, 'pair', '--dir', dir], { stdio: 'inherit' });
process.exit(run.status ?? 1);
