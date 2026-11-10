import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAP_MODE,
  MemoryAdapter,
  buildAttention,
  chartMap,
  confirmAssumption,
  type AttentionInput,
  type MapSnapshot,
  type RerouteProposal,
  type TrackerAdapter,
} from '../src';
import { readBrief, writeBrief } from '../src/discovery/briefStore';
import { contentHash } from '../src/lib/contentHash';
import { handleBriefs } from '../src/server/briefRoutes';

const now = Date.UTC(2026, 10, 4, 12);

const snap: MapSnapshot = {
  map: {
    id: 'm1',
    key: '#1',
    title: 'Reminders',
    mode: DEFAULT_MAP_MODE,
    sections: {} as MapSnapshot['map']['sections'],
    createdAt: now,
    updatedAt: now,
  },
  tickets: ['1', '2', '3'].map((id) => ({
    id,
    key: `#${id}`,
    title: `Ticket ${id}`,
    type: 'task' as const,
    body: '',
    state: 'open' as const,
    blockedBy: id === '3' ? ['2'] : [],
    comments: [],
    createdAt: now,
    updatedAt: now,
  })),
};

const proposal: RerouteProposal = {
  v: 1,
  id: 'R-1',
  mapId: 'm1',
  kind: 'challenge-destination',
  destinationReason: 'already-exists',
  by: 'codex-02',
  at: now - 60_000,
  reason: 'The export already ships in the settings page',
  evidence: 'src/settings/export.ts',
  invalidates: [],
  changes: [{ op: 'cancel_ticket', ticket: '2', reason: 'exists' }],
  status: 'pending',
  applied: [],
  created: {},
};

const input = (patch: Partial<AttentionInput>): AttentionInput => ({
  snaps: [snap],
  questions: [],
  sessions: [],
  approvals: [],
  syncs: [],
  leases: [],
  knowledge: [],
  briefs: [],
  now,
  ...patch,
});

describe('reroute attention sources', () => {
  it('a pending proposal holds its frozen tickets and says why, and outranks a suggestion', () => {
    const suggestion = {
      id: 'cancelled-with-dependents:2',
      mapId: 'm1',
      trigger: 'cancelled-with-dependents' as const,
      ticketId: '2',
      reason: '#2 was cancelled, but #3 still depends on it',
      tickets: ['3'],
    };
    const { items } = buildAttention(input({ reroutes: [{ proposal, frozen: ['2'] }], suggestions: [suggestion] }));
    expect(items.map((i) => i.kind)).toEqual(['reroute', 'reroute-suggested']);
    const [reroute, suggested] = items;
    expect(reroute.ref).toBe('R-1');
    expect(reroute.reasons).toEqual(
      expect.arrayContaining(['wrong mountain?', 'the work already exists', 'closes 1 ticket']),
    );
    expect(suggested.urgency).toBe('fyi');
    expect(suggested.title).toContain('#3 still depends on it');
  });

  it('nothing pending, nothing listed', () => {
    expect(buildAttention(input({})).items).toEqual([]);
  });
});

describe('confirmAssumption', () => {
  it('confirms holding and challenged assumptions, never invalidated ones', async () => {
    const adapter = new MemoryAdapter();
    const { map } = await chartMap(adapter, {
      title: 'Reminders',
      sections: {
        destination: 'Reminders',
        notes: '',
        decisions: [],
        unspecified: [],
        outOfScope: [],
        assumptions: [
          { id: 'S-1', text: 'Push is on', status: 'holding', tickets: [] },
          { id: 'S-2', text: 'SMS is cheap', status: 'invalidated', tickets: [], decidedBy: 'R-1' },
        ],
      },
      tickets: [],
    });
    const confirmed = await confirmAssumption(adapter, { mapId: map.id, id: 'S-1', by: 'trail lead' });
    expect(confirmed).toMatchObject({ status: 'confirmed', decidedBy: 'trail lead' });
    const after = (await adapter.loadMap(map.id)).map.sections.assumptions;
    expect(after?.find((a) => a.id === 'S-1')?.status).toBe('confirmed');
    await expect(confirmAssumption(adapter, { mapId: map.id, id: 'S-2', by: 'trail lead' })).rejects.toThrow(
      /invalidated/,
    );
    await expect(confirmAssumption(adapter, { mapId: map.id, id: 'S-9', by: 'trail lead' })).rejects.toThrow(/unknown/);
  });
});

describe('accepting a brief', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-brief-seed-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('still succeeds when its assumptions cannot be added to the trail', async () => {
    writeBrief(root, {
      mapId: 'm1',
      status: 'submitted',
      author: 'claude-01',
      submittedAt: now,
      sections: {
        summary: 'S',
        productContext: '',
        existing: '- a.ts',
        conventions: '',
        dataModel: '',
        api: '',
        risks: '',
        assumptions: [{ id: 'A-1', text: 'Push is on' }],
        openQuestions: [],
      },
    });
    const broken = {
      loadMap: () => Promise.reject(new Error('tracker unreachable')),
    } as unknown as TrackerAdapter;
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hash = contentHash(readBrief(root, 'm1')!.sections);
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ mapId: 'm1', hash }))]), { method: 'POST' });
    const res = {
      statusCode: 0,
      body: '',
      setHeader() {},
      end(b: string) {
        this.body = b;
      },
    };
    const handled = await handleBriefs(
      { root, active: async () => broken },
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      new URL('http://x/briefs/accept'),
    );
    quiet.mockRestore();
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).brief.status).toBe('accepted');
    expect(readBrief(root, 'm1')?.status).toBe('accepted');
  });
});
