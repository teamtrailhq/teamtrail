// `npm run demo`: a short, real demo of Teamtrail. It builds a small app repo in .demo/aisle (a React Native shopping
// app, Aisle, with tests and a lint), approves its checks as the trail lead would on this machine, and has a real MCP
// agent chart one trail, "Store promos by geofence": discovery done, the brief and the plan waiting for approval.
// Then it serves the Lookout for that repo, on its own port and with its own config folder, so nothing of yours is
// touched. Pair the browser with the link it prints, approve the plan, and run `npm run demo:build` for the build.
// Needs the CLI built: npm run build -w teamtrail. Safety: only a .demo folder this script made is wiped.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { approveTrust, pendingTrust } from '@teamtrail/core/agents';
import { writeDemoApp } from './demoApp';
import { chartDemoTrail } from './demoChart';
import { demoEnv, demoPaths, DEMO_PORT, mcpAgent } from './demoSetup';

const paths = demoPaths(process.env.npm_config_local_prefix ?? process.cwd());
if (!fs.existsSync(paths.cli)) {
  console.error('Build the CLI first: npm run build -w teamtrail');
  process.exit(1);
}
if (fs.existsSync(paths.root)) {
  if (!fs.existsSync(paths.marker)) {
    console.error(`${paths.root} was not made by npm run demo; refusing to wipe it.`);
    process.exit(1);
  }
  fs.rmSync(paths.root, { recursive: true, force: true });
}
fs.mkdirSync(paths.config, { recursive: true });
fs.writeFileSync(paths.marker, 'Made by npm run demo and wiped by the next one. Keep nothing here.\n');
// This process approves the checks itself (core reads the config folder from the environment).
Object.assign(process.env, demoEnv(paths));

writeDemoApp(paths.app);
for (const item of pendingTrust(paths.tracker, []).filter((i: { kind: string }) => i.kind === 'checks'))
  approveTrust({ root: paths.tracker, items: [{ key: item.key, hash: item.hash }], by: 'trail lead', snaps: [] });

const charting = await mcpAgent({ paths, client: 'claude-code' });
const charted = await chartDemoTrail(charting.call);
await charting.close();

console.log(`\nAisle is ready in ${paths.app}`);
console.log(`  ${charted.trail} ${charted.title}: discovery done, the brief and the plan wait for you.`);
console.log('  Pair the browser with the link below, then Approve the plan in Needs you.');
console.log('  Then, in another terminal: npm run demo:build\n');

const args = [paths.cli, '--port', String(DEMO_PORT), ...(process.env.DEMO_NO_OPEN ? ['--no-open'] : [])];
const lookout = spawn(process.execPath, args, { cwd: paths.app, env: process.env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => lookout.kill(signal));
lookout.on('exit', (code) => process.exit(code ?? 0));
