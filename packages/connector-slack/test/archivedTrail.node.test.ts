import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { MemoryAdapter, chartMap, setTrailArchived, transition, type MapSections } from '@teamtrail/core';
import { writeAttempt } from '@teamtrail/core/agents';
import { attentionView } from '@teamtrail/core/bridge';
import { connected, freezeTime, liveWorld, until } from './harness';

let thaw: () => void;
before(() => (thaw = freezeTime()));
after(() => thaw());

test('archiving a trail keeps the cards for what still waits on the human from it', async () => {
  const { w, calls } = liveWorld();
  try {
    const a = new MemoryAdapter({ latency: [0, 0] });
    const sections: MapSections = { destination: 'x', notes: '', decisions: [], unspecified: [], outOfScope: [] };
    const { map, tickets } = await chartMap(a, {
      title: 'Old',
      sections,
      verification: 'checks+review+human',
      tickets: [{ ref: 't', title: 'Held task', type: 'execute', body: 'Do.' }],
    });
    const t = tickets[0];
    await transition(a, map.id, t.id, { event: 'claim', actor: 'claude-07', actorKind: 'agent' });
    await transition(a, map.id, t.id, { event: 'submit', actor: 'claude-07', actorKind: 'agent' });
    const at = Date.now();
    writeAttempt(w.root, {
      ...{ v: 1, id: 'A-1', mapId: map.id, ticketId: t.id, ticketKey: t.key, agent: 'claude-07' },
      ...{ level: 'checks+review+human', configHash: 'x', submittedAt: at, finishedAt: at, resolution: 'done' },
      ...{ checks: [], result: 'fail' },
    });
    await transition(a, map.id, t.id, { event: 'checks.fail', to: 'blocked', actor: 'teamtrail', actorKind: 'engine' });
    connected(w, { notify: { target: 'dm', events: ['awaiting'], detail: 'full' } });
    const svc = w.service(a, { batchMs: 0, trailEvery: 1 });
    await until(() => svc.status().state === 'online');
    await svc.tick();
    assert.equal(calls('chat.postMessage').filter((m) => m.blocks).length, 1, 'the held ticket has its card');

    await setTrailArchived(a, map.id, true, 'trail lead');
    const queue = await attentionView({ root: w.root, adapter: a, configDir: w.configDir });
    assert.ok(
      queue.items.some((i) => i.mapId === map.id),
      'the queue still has it',
    );
    await svc.tick();
    await svc.tick();
    assert.deepEqual(calls('chat.update'), [], 'its card keeps its buttons');
  } finally {
    w.cleanup();
  }
});
