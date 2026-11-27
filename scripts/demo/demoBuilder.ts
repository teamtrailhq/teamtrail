import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { checklistOf } from './checklistOf';
import { claimWhenReady } from './claimWhenReady';
import { DEMO_GIT } from './demoApp';
import type { Call } from './demoChart';
import type { DemoPaths } from './demoSetup';
import { FEED, type Files, notifyFiles, TOGGLE_FIRST, TOGGLE_FIXED } from './demoWork';
import { beat } from './pace';

type Kind = 'feed' | 'toggle' | 'notify';
interface Ticket {
  key: string;
  title: string;
  criteria?: { id: string }[];
  guides?: { id: string; checklist: string[] }[];
}

const log = (...a: unknown[]) => console.log('claude ·', ...a);

/** Writes the files and commits them on main, as the agent's work on the ticket. */
function commit(o: { paths: DemoPaths; files: Files; message: string }) {
  for (const [file, text] of Object.entries(o.files) as [string, string][]) {
    fs.mkdirSync(path.dirname(path.join(o.paths.app, file)), { recursive: true });
    fs.writeFileSync(path.join(o.paths.app, file), text);
  }
  const git = (...a: string[]) => execFileSync('git', [...DEMO_GIT, ...a], { cwd: o.paths.app, stdio: 'ignore' });
  git('add', '--', ...Object.keys(o.files));
  git('commit', '-qm', o.message);
}

/** Claims done: Teamtrail runs the approved checks on it and says done, rework or still verifying. */
async function complete(call: Call, t: Ticket, resolution: string): Promise<{ status: string; feedback?: string }> {
  const criteria = (t.criteria ?? []).map((c) => ({ id: c.id, evidence: 'check:test' }));
  let r = await call('close_ticket', {
    trail: '#1',
    ticket: t.key,
    resolution,
    criteria,
    ...checklistOf(t),
    waitSeconds: 600,
  });
  while (r.status === 'verifying') r = await call('verification_status', { ticket: t.key, wait: true });
  return r;
}

const say = (call: Call, step: string, message: string) => call('report_progress', { trail: '#1', step, message });

/** How many promos per store per day the trail lead chose, from their answer; 1 when it names no number. */
const perDay = (answer: string) => Number(answer.match(/\d+/)?.[0] ?? 1) || 1;

/** Asks the trail lead the daily limit mid-work, a product call (medium risk) the agent waits on. */
async function askLimit(call: Call, key: string) {
  const asked = await call('ask_human', {
    question:
      'A shopper in a mall walks past the same store several times a day. How many promos should one store send them per day at most?',
    summary: 'How many promos per store per day, at most?',
    suggestions: ['1 per store per day', '2 per store per day', '3 per store per day'],
    category: 'product-behaviour',
    urgency: 'blocking',
    blocks: [key],
    waitSeconds: 3600,
  });
  if (!asked.answered) throw new Error('no answer to the daily limit within the hour');
  log(`answered: ${asked.answer}`);
  return perDay(asked.answer);
}

/** The builder on one ticket: claim, read, write, commit, complete; on rework, fix it and complete again. */
export async function buildTicket(o: {
  call: Call;
  key: string;
  kind: Kind;
  paths: DemoPaths;
  onClaim?: () => void;
  always?: boolean;
}) {
  const t: Ticket = await claimWhenReady({ call: o.call, key: o.key, who: 'claude' });
  o.onClaim?.();
  log(`claimed ${t.key} ${t.title}`);
  await say(o.call, 'Claim', t.title);
  await beat(3);
  let files: Files;
  if (o.kind === 'feed') {
    await say(o.call, 'Resolve', 'Reading src/api/promoFeed.js and src/geo/distance.js');
    files = FEED;
  } else if (o.kind === 'toggle') {
    await say(o.call, 'Resolve', 'Adding the promos switch to Settings');
    files = TOGGLE_FIRST;
  } else {
    await say(o.call, 'Resolve', 'Wiring geofence entry to a local notification');
    await beat(2);
    files = notifyFiles({ perDay: await askLimit(o.call, t.key), always: o.always ?? false });
  }
  await beat(4);
  await say(o.call, 'Record', `Writing ${Object.keys(files).join(', ')}`);
  commit({ paths: o.paths, files, message: `${t.title} (${t.key})` });
  await beat(2);
  let r = await complete(o.call, t, `${t.title}: done, with tests.`);
  log(`${t.key}: ${r.status}`);
  if (r.status === 'rework' && o.kind !== 'toggle')
    throw new Error(`${t.key} went back for rework: ${r.feedback ?? ''}`);
  if (r.status === 'rework') {
    await beat(3);
    const again: Ticket = await claimWhenReady({ call: o.call, key: o.key, who: 'claude' });
    await say(
      o.call,
      'Resolve',
      'The test caught it: promos were on by default. Turning them off until the shopper opts in.',
    );
    await beat(5);
    commit({ paths: o.paths, files: TOGGLE_FIXED, message: `Promos off by default (${t.key})` });
    r = await complete(o.call, again, `${t.title}: promos are off until the shopper turns them on.`);
    log(`${t.key}: ${r.status}`);
  }
  await beat(2);
}
