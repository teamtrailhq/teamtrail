// M5 in the dev seed: a second project, so `npm run dev` shows the project switcher and All projects. The
// registry and the second repo live under node_modules/.cache, never in your real config dir; the dev server
// reads the registry there (apps/lookout/vite.config.ts). A third, removed repo shows how "missing" looks.
import fs from 'node:fs';
import path from 'node:path';
import { claim, MarkdownAdapter, type TicketLease } from '@teamtrail/core';
import { writeLease } from '@teamtrail/core/agents';
import { nodeMarkdownFs, registerProject } from '@teamtrail/core/node';

const DAY = 24 * 3_600_000;

/** Where the dev registry and the extra repos live. Wiped on every seed. */
export const devProjectsDir = (repoRoot: string) =>
  path.join(repoRoot, 'node_modules', '.cache', 'teamtrail-dev-projects');

async function seedBilling(root: string, now: number) {
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const map = await adapter.createMap({
    title: 'Usage-based invoices',
    mode: 'plan+execute',
    sections: {
      destination: 'Customers are billed for what they use, with an invoice that explains every line.',
      notes: 'Finance wants this before the next pricing change.',
      decisions: [],
      unspecified: ['Credit notes'],
      outOfScope: ['Tax engine changes'],
    },
  });
  const meter = await adapter.createTicket(map.id, {
    title: 'Meter API calls per workspace',
    type: 'execute',
    body: '',
  });
  const rounding = await adapter.createTicket(map.id, {
    title: 'How do we round partial units?',
    type: 'junction',
    hitl: true,
    body: '',
  });
  const invoice = await adapter.createTicket(map.id, { title: 'Invoice line items', type: 'execute', body: '' });
  await adapter.addBlocking(map.id, rounding.id, invoice.id);
  await claim(adapter, map.id, meter.id, { assignee: 'codex-03' });
  const lease: TicketLease = {
    v: 1,
    mapId: map.id,
    ticketId: meter.id,
    ticketKey: meter.key,
    agent: 'codex-03',
    pid: process.pid,
    claimedAt: now - 40 * 60_000,
    renewedAt: now - 30 * 60_000,
    // Quiet for half an hour on a week-long lease: live, so the card shows work in flight.
    ttlMs: 7 * DAY,
    expiresAt: now + 7 * DAY,
    notes: ['Counting calls in the gateway middleware'],
    decisions: [],
  };
  writeLease(root, lease);
}

/** Registers the dev repo itself plus a second seeded repo and a missing one, in a dev-only registry. */
export async function seedProjects(input: { repoRoot: string; homeRoot: string; now: number }) {
  const dir = devProjectsDir(input.repoRoot);
  fs.rmSync(dir, { recursive: true, force: true });
  const config = path.join(dir, 'config');
  const billing = path.join(dir, 'billing-service', '.teamtrail');
  fs.mkdirSync(billing, { recursive: true });
  await seedBilling(billing, input.now);
  const gone = path.join(dir, 'old-prototype', '.teamtrail');
  fs.mkdirSync(gone, { recursive: true });
  for (const root of [input.homeRoot, billing, gone]) registerProject({ configDir: config, root, now: input.now });
  fs.rmSync(path.dirname(gone), { recursive: true, force: true });
  return { config, billing };
}
