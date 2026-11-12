import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MemoryAdapter, chartMap, claim, transition, type MapSections, type Ticket } from '@teamtrail/core';
import { operatorAction, readVerdicts, writeAttempt, writeVerdict } from '@teamtrail/core/agents';
import type { FakeSlack } from './fakes/slack';
import { ANA, EVE, RAJ, agentDoc, connected, readJson, until, type World } from './harness';

const SECTIONS: MapSections = {
  destination: 'A durable event store.',
  notes: '',
  decisions: [],
  unspecified: [],
  outOfScope: [],
};

export async function eventStore() {
  const a = new MemoryAdapter({ latency: [0, 0], label: 'GitHub Issues', location: 'octo-org/launchpad' });
  const { map, tickets } = await chartMap(a, {
    title: 'Event store',
    sections: SECTIONS,
    tickets: [
      { ref: 'bench', title: 'Bench write paths', type: 'research', body: 'Measure.' },
      { ref: 'db', title: 'Pick DB', type: 'junction', body: 'Postgres or SQLite?' },
      { ref: 'retention', title: 'Retention policy', type: 'junction', body: 'How long?' },
      { ref: 'migrate', title: 'Migrate schema', type: 'execute', body: 'Apply.', blockedBy: ['db'] },
    ],
  });
  const second = await chartMap(a, {
    title: 'Mobile sync',
    sections: SECTIONS,
    tickets: [{ ref: 'conf', title: 'Conflict policy', type: 'junction', body: 'LWW?' }],
  });
  const [bench, db, retention, migrate] = tickets;
  await claim(a, map.id, db.id, { assignee: 'claude-07' });
  return { a, map, bench, db, retention, migrate, second };
}

/** Agent asks reach the owner as DMs; answers from buttons or the reply modal reach the agent; UI answers close the DM. */
export async function askFlow(w: World) {
  const { a, map, db, retention } = await eventStore();
  connected(w, { allow: [RAJ] });
  const svc = w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  agentDoc(w.root, {
    sid: 's1',
    mapId: map.id,
    ticketId: db.id,
    pending: [
      {
        id: 'q1',
        ticketId: db.id,
        text: 'Postgres or SQLite for the event store? Postgres needs a container in CI.',
        suggestions: ['Postgres', 'SQLite'],
        at: Date.now(),
      },
    ],
  });
  await svc.tick();
  const asks1 = readJson(path.join(w.root, '.agents', 'slack.json')).asks;
  const dm = asks1.q1.channel as string;
  const ts1 = asks1.q1.ts as string;
  await w.send(svc, 'eve (not allowed) clicks Postgres', (f) => f.payload.click(EVE, dm, ts1, 'ask_option:0'));
  await w.send(svc, 'ana clicks Postgres', (f) => f.payload.click(ANA, dm, ts1, 'ask_option:0'));
  const answerFile = path.join(w.root, '.agents', 'answers', 's1', 'q1.json');
  const answer1 = existsSync(answerFile) ? readJson(answerFile) : undefined;
  await w.send(svc, 'raj clicks SQLite late', (f) => f.payload.click(RAJ, dm, ts1, 'ask_option:1'));
  // The agent's process picks up the answer and stops waiting.
  agentDoc(w.root, {
    sid: 's1',
    mapId: map.id,
    ticketId: db.id,
    chats: [{ id: 'c1', from: 'human', author: 'slack:U0ANA0001', text: 'Postgres', at: Date.now() }],
  });
  await svc.tick();

  // Answered in the Lookout instead.
  agentDoc(w.root, {
    sid: 's2',
    mapId: map.id,
    ticketId: retention.id,
    agent: 'codex-02',
    pending: [{ id: 'q2', ticketId: retention.id, text: 'Keep events for 30 or 90 days?', at: Date.now() }],
  });
  await svc.tick();
  agentDoc(w.root, {
    sid: 's2',
    mapId: map.id,
    ticketId: retention.id,
    agent: 'codex-02',
    chats: [{ id: 'c2', from: 'human', author: 'trail lead', text: '90 days', at: Date.now() }],
  });
  await svc.tick();

  // Reply… opens a modal.
  agentDoc(w.root, {
    sid: 's3',
    mapId: map.id,
    agent: 'claude-09',
    pending: [{ id: 'q3', text: 'Name for the events table?', at: Date.now() }],
  });
  await svc.tick();
  const ts3 = readJson(path.join(w.root, '.agents', 'slack.json')).asks.q3.ts as string;
  await w.send(svc, 'ana clicks Reply…', (f) => f.payload.click(ANA, dm, ts3, 'ask_reply'));
  await w.send(svc, 'ana submits an empty reply', (f) =>
    f.payload.submit(ANA, [...f.views.keys()].at(-1)!, { answer: '' }),
  );
  await w.send(svc, 'ana submits the reply', (f) =>
    f.payload.submit(ANA, [...f.views.keys()].at(-1)!, { answer: 'event_log' }),
  );
  const answer3 = readJson(path.join(w.root, '.agents', 'answers', 's3', 'q3.json'));
  agentDoc(w.root, {
    sid: 's3',
    mapId: map.id,
    agent: 'claude-09',
    chats: [{ id: 'c3', from: 'human', author: 'slack:U0ANA0001', text: 'event_log', at: Date.now() }],
  });

  // Agent quits while waiting.
  agentDoc(w.root, { sid: 's4', mapId: map.id, pending: [{ id: 'q4', text: 'Ship behind a flag?', at: Date.now() }] });
  await svc.tick();
  agentDoc(w.root, { sid: 's4', mapId: map.id, status: 'done' });
  await svc.tick();

  await w.send(svc, '/scout inbox with nothing waiting', (f) => f.payload.command(ANA, dm, 'inbox'));
  const asks = readJson(path.join(w.root, '.agents', 'slack.json')).asks;
  return { answer1, answer3, asks, answers: readdirSync(path.join(w.root, '.agents', 'answers')) };
}

/** "Save as decision" on a thread and `/scout decide`: modal, related ticket, record, tracker write-back, confirmation. */
export async function decisionFlow(w: World) {
  const { a, map, db, second } = await eventStore();
  connected(w, { allow: [RAJ] });
  const svc = w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  let root = '';
  let reply = '';
  if (w.fake) {
    root = w.fake.human.post('C0INFRA01', ANA, 'Event store: Postgres or SQLite? <@U0RAJ0001> any numbers?');
    w.fake.human.post('C0INFRA01', RAJ, 'Postgres handled 40k writes/s in the bench; SQLite topped at 6k.', root);
    w.fake.human.post('C0INFRA01', ANA, 'CI needs a container for Postgres though.', root);
    reply = w.fake.human.post(
      'C0INFRA01',
      RAJ,
      'Use Postgres; SQLite for tests. See <https://example.com/bench|the bench>.',
      root,
    );
    w.fake.human.post('C0RANDOM1', ANA, 'Lunch?');
  }
  const lastView = (f: { views: Map<string, unknown> }) => [...f.views.keys()].at(-1)!;
  await w.send(svc, 'eve (not allowed) runs Save as decision', (f) => f.payload.shortcut(EVE, 'C0INFRA01', reply));
  await w.send(svc, 'ana runs Save as decision on the last reply', (f) => f.payload.shortcut(ANA, 'C0INFRA01', reply));
  await w.send(svc, 'ana switches the trail', (f) => f.payload.pick(ANA, lastView(f), 'trail_pick', second.map.id));
  await w.send(svc, 'ana switches back', (f) => f.payload.pick(ANA, lastView(f), 'trail_pick', map.id));
  await w.send(svc, 'ana saves with the decision emptied', (f) => f.payload.submit(ANA, lastView(f), { decision: '' }));
  await w.send(svc, 'ana saves', (f) => f.payload.submit(ANA, lastView(f)));
  const snap = await a.loadMap(map.id);
  const records = await a.listDecisions(map.id);

  await w.send(svc, 'raj runs Save as decision where Scout is not invited', (f) =>
    f.payload.shortcut(RAJ, 'C0RANDOM1', f.channels.get('C0RANDOM1')!.messages[0].ts),
  );
  await w.send(svc, 'raj runs /scout decide in #scout-test', (f) =>
    f.payload.command(RAJ, 'G0ScoutTST', 'decide SQLite for tests, Postgres in CI'),
  );
  await w.send(svc, 'raj saves it as trail only', (f) => f.payload.submit(RAJ, lastView(f), { mode: 'trail' }));
  const after = await a.loadMap(map.id);
  const all = await a.listDecisions(map.id);
  return { snap, records, after, all, dbId: db.id, mapId: map.id };
}

/** `/scout status`, `/scout help`, and refusals. */
export async function statusFlow(w: World) {
  const { a, map, db } = await eventStore();
  connected(w);
  const svc = w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  agentDoc(w.root, {
    sid: 's1',
    mapId: map.id,
    ticketId: db.id,
    pending: [{ id: 'q1', ticketId: db.id, text: 'Postgres or SQLite?', at: Date.now() - 12 * 60_000 }],
  });
  const help = await w.send(svc, '/scout help', (f) => f.payload.command(ANA, 'C0INFRA01', 'help'));
  const refused = await w.send(svc, 'eve runs /scout status', (f) => f.payload.command(EVE, 'C0INFRA01', 'status'));
  await w.send(svc, '/scout status', (f) => f.payload.command(ANA, 'C0INFRA01', 'status'));
  await w.send(svc, '/scout status event', (f) => f.payload.command(ANA, 'C0INFRA01', 'status event'));
  await w.send(svc, '/scout status nope', (f) => f.payload.command(ANA, 'C0INFRA01', 'status nope'));
  await w.send(svc, '/scout inbox', (f) => f.payload.command(ANA, 'C0INFRA01', 'inbox'));
  const unknown = await w.send(svc, '/scout dance', (f) => f.payload.command(ANA, 'C0INFRA01', 'dance'));
  return { help, refused, unknown };
}

/** Notifications: blocked and trail done, one message per trail per window, threaded under the day's first. */
export async function notifyFlow(w: World) {
  const { a, map, bench, db, retention, migrate } = await eventStore();
  connected(w, {
    notify: { target: 'dm', events: ['awaiting', 'blocked', 'trail.done', 'resolved'], detail: 'full' },
  });
  const svc = w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  await svc.tick(); // baseline: nothing is sent for the state Scout found
  await a.addBlocking(map.id, retention.id, bench.id);
  await svc.tick();
  for (const t of [bench, db, retention, migrate]) await a.close(map.id, t.id, 'completed');
  await svc.tick();
  await svc.tick();
}

/** The channel and ts of the message Scout posted whose text starts with `prefix`. */
export function posted(f: FakeSlack, prefix: string): [string, string] {
  for (const [id, c] of f.channels) {
    const m = c.messages.find((x) => x.text.startsWith(prefix));
    if (m) return [id, m.ts];
  }
  throw new Error(`no message starting "${prefix}"`);
}

/**
 * A trail at checks+review+human: #2 is a reviewed pass to approve (`changed`: the files git saw it change), #3
 * failed its checks and is held.
 */
export async function approvalTrail(w: World, o: { changed?: string[] } = {}) {
  const a = new MemoryAdapter({ latency: [0, 0] });
  writeFileSync(
    path.join(w.root, 'verification.json'),
    JSON.stringify({ v: 1, checks: { ok: { run: ['true'] } }, run: ['ok'] }),
  );
  const { map, tickets } = await chartMap(a, {
    title: 'Event store',
    sections: SECTIONS,
    verification: 'checks+review+human',
    tickets: [
      { ref: 'api', title: 'Write API', type: 'execute', body: 'Build.' },
      { ref: 'mig', title: 'Migrate schema', type: 'execute', body: 'Apply.' },
    ],
  });
  const [api, mig] = tickets;
  const git = o.changed && {
    v: 1 as const,
    changed: o.changed.map((p) => ({ path: p, add: 1, del: 0 })),
    stats: { files: o.changed.length, add: o.changed.length, del: 0 },
    flags: [],
  };
  const attempt = (t: Ticket, result: 'pass' | 'fail') =>
    writeAttempt(w.root, {
      v: 1,
      id: 'A-1',
      mapId: map.id,
      ticketId: t.id,
      ticketKey: t.key,
      agent: 'claude-07',
      level: 'checks+review+human',
      configHash: 'x',
      submittedAt: Date.now(),
      finishedAt: Date.now(),
      resolution: `Did ${t.title}`,
      checks: [],
      result,
      ...(git && t.id === api.id ? { git } : {}),
    });
  for (const t of [api, mig]) {
    await transition(a, map.id, t.id, { event: 'claim', actor: 'claude-07', actorKind: 'agent' });
    await transition(a, map.id, t.id, { event: 'submit', actor: 'claude-07', actorKind: 'agent' });
  }
  attempt(api, 'pass');
  writeVerdict(w.root, {
    v: 1,
    mapId: map.id,
    ticketId: api.id,
    attemptId: 'A-1',
    by: 'claude-02',
    byKind: 'agent',
    verdict: 'PASS',
    summary: 'The write path is covered by tests',
    findings: [],
    at: Date.now(),
  });
  attempt(mig, 'fail');
  await transition(a, map.id, mig.id, { event: 'checks.fail', to: 'blocked', actor: 'teamtrail', actorKind: 'engine' });
  return { a, map, api, mig };
}

/** A reviewed pass to approve and a held ticket reach the owner; Approve and Rework… decide them from Slack. */
export async function approvalFlow(w: World) {
  const { a, map, api, mig } = await approvalTrail(w);
  connected(w, { allow: [RAJ] });
  const svc = w.service(a);
  await until(() => svc.status().state === 'online', 'socket online');
  await svc.tick();
  await w.send(svc, 'eve (not allowed) clicks Approve', (f) =>
    f.payload.click(EVE, ...posted(f, 'Approve'), 'verify_approve'),
  );
  await w.send(svc, 'ana clicks Approve', (f) => f.payload.click(ANA, ...posted(f, 'Approve'), 'verify_approve'));
  await w.send(svc, 'ana clicks Rework… on the held ticket', (f) =>
    f.payload.click(ANA, ...posted(f, 'Held'), 'verify_rework'),
  );
  await w.send(svc, 'ana submits an empty reason', (f) =>
    f.payload.submit(ANA, [...f.views.keys()].at(-1)!, { reason: '' }),
  );
  await w.send(svc, 'ana submits the reason', (f) =>
    f.payload.submit(ANA, [...f.views.keys()].at(-1)!, { reason: 'Split the migration in two' }),
  );
  await svc.tick();
  const snap = await a.loadMap(map.id);
  return {
    api: snap.tickets.find((t) => t.id === api.id)!,
    mig: snap.tickets.find((t) => t.id === mig.id)!,
    verdicts: [...readVerdicts(w.root, map.id, api.id), ...readVerdicts(w.root, map.id, mig.id)],
  };
}

/**
 * Scout restarts while both approvals wait; meanwhile #2 is approved in the
 * Lookout. The new process updates the stored messages in place instead
 * of posting again, and buttons on messages that are out of date are refused.
 */
export async function approvalRestartFlow(w: World) {
  const { a, map, api, mig } = await approvalTrail(w);
  connected(w);
  const first = w.service(a);
  await until(() => first.status().state === 'online', 'socket online');
  await first.tick();
  first.close();
  await operatorAction(
    { adapter: a, root: w.root },
    { action: 'approve', mapId: map.id, ticketId: api.id, by: 'trail lead' },
  );

  const second = w.service(a);
  await until(() => second.status().state === 'online', 'second socket online');
  await second.tick();
  await w.send(second, 'ana clicks Approve on the message from before the restart', (f) =>
    f.payload.click(ANA, ...posted(f, 'No longer waiting'), 'verify_approve'),
  );
  await operatorAction(
    { adapter: a, root: w.root },
    { action: 'rework', mapId: map.id, ticketId: mig.id, by: 'trail lead', reason: 'Redo it' },
  );
  await w.send(second, 'ana clicks Rework… after the trail lead sent it back', (f) =>
    f.payload.click(ANA, ...posted(f, 'Held'), 'verify_rework'),
  );
  await second.tick();
  const snap = await a.loadMap(map.id);
  return {
    api: snap.tickets.find((t) => t.id === api.id)!,
    mig: snap.tickets.find((t) => t.id === mig.id)!,
    verdicts: [...readVerdicts(w.root, map.id, api.id), ...readVerdicts(w.root, map.id, mig.id)],
    stored: readJson(path.join(w.root, '.agents', 'slack-approvals.json')).approvals,
  };
}
