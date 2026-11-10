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

// What each session has used so far and, for the earlier one, the questions you answered it today (minutes ago asked,
// minutes waited), so the trail's spend and your answer times start from a morning's work, not from zero.
const AGENTS = [
  {
    agent: 'codex-01',
    model: 'gpt-5.1-codex-mini',
    ticket: 'Show sync status in the note list',
    ago: 12,
    usage: { inputTokens: 412_000, outputTokens: 38_600, costUsd: 0.91 },
    answered: [],
  },
  {
    agent: 'claude-05',
    model: 'claude-sonnet-4-5',
    ago: 30,
    usage: { inputTokens: 1_284_000, outputTokens: 96_400, costUsd: 5.3 },
    answered: [
      { ago: 212, waited: 3 },
      { ago: 95, waited: 7 },
    ],
  },
];

function sessionDoc(input: {
  mapId: string;
  agent: string;
  model: string;
  ticketId?: string;
  at: number;
  now: number;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
  answered: { ago: number; waited: number }[];
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
      usage: { ...input.usage, source: 'reported' },
    },
    chats: [],
    pending: [],
    answered: input.answered.map((q, i) => ({
      id: `q_seed_${input.agent}_${i}`,
      mapId: input.mapId,
      sessionId: `s_seed_${input.agent}`,
      agent: input.agent,
      askedAt: input.now - q.ago * 60_000,
      answeredAt: input.now - (q.ago - q.waited) * 60_000,
    })),
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
    const doc = sessionDoc({ ...a, mapId: main.id, ticketId, at: now - a.ago * 60_000, now });
    writeJsonAtomic(path.join(root, agentPaths.session(doc.session.id)), doc);
  }
}
