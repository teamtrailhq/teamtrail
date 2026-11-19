// Runs a test command in a temp folder of its own (testTemp.mjs) and fails it when its tests leave anything there.
//   node scripts/test-temp.mjs <label> <command> [args…]
// Used by `npm test` (vitest) and `npm run verify:mcp`; the node:test runners (packages/*/test/run.mjs) call
// testTemp themselves.
import { spawn } from 'node:child_process';
import { reportLeftovers } from './reportLeftovers.mjs';
import { testTemp } from './testTemp.mjs';

const [label, command, ...args] = process.argv.slice(2);
if (!label || !command) {
  console.error('usage: node scripts/test-temp.mjs <label> <command> [args…]');
  process.exit(2);
}

const temp = testTemp(label);
const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...temp.env } });
const forward = (signal) => child.kill(signal);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, forward);

child.on('error', (e) => {
  console.error(`${command}: ${e.message}`);
  temp.finish();
  process.exit(1);
});
child.on('exit', (code, signal) => {
  const failed = reportLeftovers(label, temp.finish());
  if (signal) process.exit(1);
  process.exit(code || (failed ? 1 : 0));
});
