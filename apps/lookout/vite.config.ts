import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { BRAND } from '../../packages/core/src/model/brand';
import { holdIpv6Loopback } from './plugins/holdIpv6Loopback';
import { trackerFs } from './plugins/trackerFs';

// Dev tracker folder: $<DATA_DIR_ENV>, else <dataDir> at the repo root, the folder `npm run seed` resets and
// `npm run dev:agent` works in, so all three always agree.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.resolve(repoRoot, process.env[BRAND.dataDirEnv] || BRAND.dataDir);
// The dev seed's projects registry (scripts/seedProjects.ts), so `npm run dev` never reads or writes your real one.
const devProjects = path.join(repoRoot, 'node_modules', '.cache', 'teamtrail-dev-projects', 'config');
const projectsConfigDir = process.env.TEAMTRAIL_CONFIG_DIR || (existsSync(devProjects) ? devProjects : undefined);

// The CLI this Lookout ships in: the commands it shows name exactly this version (src/lib/cliVersion.ts).
const cli = JSON.parse(readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8')) as { version: string };

export default defineConfig({
  define: { __CLI_VERSION__: JSON.stringify(cli.version) },
  plugins: [react(), holdIpv6Loopback(), trackerFs({ root: dataDir, prefix: BRAND.apiPrefix, projectsConfigDir })],
  // Not 5173: agents' own dev servers commonly take it, and a server squatting this port would get the dev page's
  // origin (the page checks its server before sending its session, but a stranger's page there reads its storage).
  // 127.0.0.1, never `localhost`: one address, held with [::1] beside it (plugins/holdIpv6Loopback.ts); a taken port
  // stops it rather than moving on.
  server: { port: 7477, host: '127.0.0.1', strictPort: true },
});
