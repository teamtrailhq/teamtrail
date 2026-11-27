// `npm run demo:build`: the build, by two real MCP agents on the demo trail (after `npm run demo`). They wait for you
// to approve the plan, then: the builder writes and commits each task, and Teamtrail runs the app's checks on it (the
// Settings switch fails its test first and goes back to rework); the other agent asks you the location question,
// high risk, so only the Lookout can answer it; and the builder asks how many promos per store per day mid-work.
// DEMO_PACE=2 makes every step twice as slow, 0.5 twice as fast.
import fs from 'node:fs';
import { buildTicket } from './demoBuilder';
import { decide } from './demoDecide';
import { demoPaths, mcpAgent } from './demoSetup';
import { ticketKeys } from './ticketKeys';

const paths = demoPaths(process.env.npm_config_local_prefix ?? process.cwd());
if (!fs.existsSync(paths.marker)) {
  console.error('Run npm run demo first (and keep it running).');
  process.exit(1);
}

const builder = await mcpAgent({ paths, client: 'claude-code' });
const decider = await mcpAgent({ paths, client: 'codex', version: '0.120.0' });
const keys = await ticketKeys(builder.call);
console.log(
  'Two agents on #1 Store promos by geofence. Approve the plan in the Lookout to start the build. Ctrl+C to stop.',
);

let started!: () => void;
const building = new Promise<void>((r) => (started = r));
const decision = decide({ call: decider.call, key: keys.permission, after: building });
try {
  await buildTicket({ call: builder.call, key: keys.feed, kind: 'feed', paths, onClaim: started });
  await buildTicket({ call: builder.call, key: keys.toggle, kind: 'toggle', paths });
  const always = await decision;
  await buildTicket({ call: builder.call, key: keys.notify, kind: 'notify', paths, always });
  console.log('All done: the trail reached its destination. Open the map to see it verified.');
} finally {
  await Promise.all([builder.close(), decider.close()]);
}
process.exit(0);
