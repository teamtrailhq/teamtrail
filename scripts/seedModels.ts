// M5 in the dev seed: model matching on the main trail, a project model table, and two connected agents on different
// models, so the Lookout shows session tiers, the tier settings, and a junction waiting for a strongest model.
// The agents' session docs name pid 1, which is always running, so they count as connected while you look around;
// a real agent's doc names its own MCP process. Real matching runs with `npm run dev:agent` or verify-mcp.
import fs from 'node:fs';
import path from 'node:path';
import {
  agentPaths,
  MODELS_FILE,
  setModelMatching,
  STEPS,
  tierOfModel,
  type AgentSessionDoc,
  type MapDoc,
  type TrackerAdapter,
} from '@teamtrail/core';
import { writeJsonAtomic } from '@teamtrail/core/agents';

interface SeedInput {
  root: string;
  adapter: TrackerAdapter;
  main: MapDoc;
  now: number;
}

const ALWAYS_RUNNING_PID = 1;

const AGENTS = [
  { agent: 'codex-01', model: 'gpt-5.1-codex-mini', ticket: 'Show sync status in the note list', ago: 12 },
  { agent: 'claude-05', model: 'claude-sonnet-4-5', ago: 30 },
];

function sessionDoc(input: {
  mapId: string;
  agent: string;
  model: string;
  ticketId?: string;
  at: number;
  now: number;
}) {
  const { tier } = tierOfModel(input.model);
  const working = !!input.ticketId;
  const doc: AgentSessionDoc = {
    v: 1,
    session: {
      id: `s_seed_${input.agent}`,
      agent: input.agent,
      mode: 'work',
      mapId: input.mapId,
      ticketId: input.ticketId,
      step: working ? 3 : 5,
      total: STEPS.work.length,
      stepLabel: working ? STEPS.work[2] : STEPS.work[4],
      status: working ? 'running' : 'done',
      startedAt: input.at,
      ...(working ? {} : { endedAt: input.now - 5 * 60_000 }),
      model: input.model,
      tier,
    },
    chats: [],
    pending: [],
    answered: [],
    feed: [],
    client: input.agent.startsWith('codex') ? 'codex 0.50.0' : 'claude-code 2.1.0',
    pid: ALWAYS_RUNNING_PID,
    updatedAt: input.now,
  };
  return doc;
}

export async function seedModels({ root, adapter, main, now }: SeedInput) {
  fs.writeFileSync(
    path.join(root, MODELS_FILE),
    `${JSON.stringify({ v: 1, models: { 'acme-coder-*': 'balanced' } }, null, 2)}\n`,
  );
  await setModelMatching(adapter, main.id, { enabled: true, tiers: { research: 'balanced' } }, 'trail lead');
  const snap = await adapter.loadMap(main.id);
  for (const a of AGENTS) {
    const ticketId = a.ticket && snap.tickets.find((t) => t.title.startsWith(a.ticket) && t.state === 'open')?.id;
    const doc = sessionDoc({ mapId: main.id, agent: a.agent, model: a.model, ticketId, at: now - a.ago * 60_000, now });
    writeJsonAtomic(path.join(root, agentPaths.session(doc.session.id)), doc);
  }
}
