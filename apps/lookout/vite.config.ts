import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { BRAND } from '../../packages/core/src/model/brand';
import { trackerFs } from './plugins/trackerFs';

// Dev tracker folder: $<DATA_DIR_ENV>, else <dataDir> at the repo root, the folder `npm run seed` resets and
// `npm run dev:agent` works in, so all three always agree.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = path.resolve(repoRoot, process.env[BRAND.dataDirEnv] || BRAND.dataDir);
// The dev seed's projects registry (scripts/seedProjects.ts), so `npm run dev` never reads or writes your real one.
const devProjects = path.join(repoRoot, 'node_modules', '.cache', 'teamtrail-dev-projects', 'config');
const projectsConfigDir = process.env.TEAMTRAIL_CONFIG_DIR || (existsSync(devProjects) ? devProjects : undefined);

export default defineConfig({
  plugins: [react(), trackerFs({ root: dataDir, prefix: BRAND.apiPrefix, projectsConfigDir })],
  server: { port: 5173, host: true },
});
