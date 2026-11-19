// Runs a test command in a temp folder of its own (testTemp.mjs) and fails it when its tests leave anything there.
//   node scripts/test-temp.mjs <label> <command> [args…]
// Used by `npm test` (vitest) and `npm run verify:mcp`; the node:test runners (packages/*/test/run.mjs) call
// runInTemp themselves.
import { runInTemp } from './runInTemp.mjs';

const [label, command, ...args] = process.argv.slice(2);
if (!label || !command) {
  console.error('usage: node scripts/test-temp.mjs <label> <command> [args…]');
  process.exit(2);
}
process.exit(await runInTemp({ label, command, args, env: () => process.env }));
