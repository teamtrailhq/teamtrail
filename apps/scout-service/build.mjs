// Bundles the service into one file for Railway: `node dist/main.mjs`. `ws` and `pg` stay as dependencies.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['ws', 'pg'],
  sourcemap: true,
  logLevel: 'warning',
});
