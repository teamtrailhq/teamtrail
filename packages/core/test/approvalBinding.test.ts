import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chartMap, MemoryAdapter, numbered, submitted, type TrackerAdapter } from '../src';
import { writeCriteriaProposal } from '../src/criteria/criteriaProposals';
import { readCriteria, writeTicketCriteria } from '../src/criteria/criteriaStore';
import { readBrief, writeBrief } from '../src/discovery/briefStore';
import { readKnowledge, writeKnowledge } from '../src/knowledge/knowledgeStore';
import { handleBriefs } from '../src/server/briefRoutes';
import { handleCriteriaProposals } from '../src/server/criteriaProposalRoutes';
import { handleCriteria } from '../src/server/criteriaRoutes';
import { handleKnowledge } from '../src/server/knowledgeRoutes';
import { handleReroutes } from '../src/server/rerouteRoutes';

/*
 * The human approves what they were shown, not whatever the file holds when the click lands: every confirm or
 * accept carries the hash (or text) of what the Lookout rendered, and a file that changed since gets a 409.
 */

let root: string;
let adapter: TrackerAdapter;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-binding-'));
  adapter = new MemoryAdapter();
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;
async function call(handle: Handler, method: string, url: string, body?: unknown) {
  const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), {
    method,
    headers: {},
  }) as unknown as IncomingMessage;
  const res = {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(b: string) {
      this.body = b;
    },
  };
  try {
    await handle(req, res as unknown as ServerResponse, new URL(`http://x${url}`));
  } catch (e) {
    return {
      status: (e as Error).name === 'BadRequest' || /required/.test((e as Error).message) ? 400 : 500,
      body: {},
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON bodies in a test
  return { status: res.statusCode, body: JSON.parse(res.body || '{}') as Record<string, any> };
}

const map = { id: 'm1', title: 'M' };
const ticket = { id: '1', key: '#1' };

describe('confirming criteria binds to what was shown', () => {
  const h: Handler = (req, res, url) => handleCriteria(root, req, res, url);
  it('refuses without the hash, and with a hash of criteria that changed since', async () => {
    writeTicketCriteria(root, map, ticket, { criteria: numbered([{ text: 'Exports every row', kind: 'unit' }]) });
    const read = await call(h, 'GET', '/criteria?mapId=m1');
    const hash = read.body.tickets[0].hash;
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    writeTicketCriteria(root, map, ticket, { criteria: numbered([{ text: 'Trivially true', kind: 'unit' }]) });
    const confirm = (extra: object) =>
      call(h, 'POST', '/criteria/confirm', { mapId: 'm1', ticketId: '1', ticketKey: '#1', ...extra });
    expect((await confirm({})).status).toBe(400);
    expect((await confirm({ hash })).status).toBe(409);
    expect(readCriteria(root, 'm1')[0].confirmed).toBeUndefined();
    const fresh = (await call(h, 'GET', '/criteria?mapId=m1')).body.tickets[0].hash;
    expect((await confirm({ hash: fresh })).status).toBe(200);
  });
});

describe('accepting proposed criteria binds to what was shown', () => {
  const h: Handler = (req, res, url) => handleCriteriaProposals(root, req, res, url);
  it('refuses a proposal swapped while the human read it', async () => {
    const propose = (text: string) =>
      writeCriteriaProposal(root, 'm1', {
        ...{ ticketId: '1', ticketKey: '#1' },
        criteria: numbered([{ text, kind: 'unit' }]),
        by: 'claude-01',
        at: 1,
      });
    propose('A good one');
    const hash = (await call(h, 'GET', '/criteria-proposals?mapId=m1')).body.proposals[0].hash;
    propose('Trivially true');
    expect((await call(h, 'POST', '/criteria-proposals/accept', { mapId: 'm1', ticketId: '1' })).status).toBe(400);
    expect((await call(h, 'POST', '/criteria-proposals/accept', { mapId: 'm1', ticketId: '1', hash })).status).toBe(
      409,
    );
    expect(readCriteria(root, 'm1')).toEqual([]);
  });
});

describe('accepting a brief binds to what was shown', () => {
  const h: Handler = (req, res, url) => handleBriefs({ root, active: async () => adapter }, req, res, url);
  it('refuses a brief resubmitted while the human read it', async () => {
    const sections = (summary: string) => ({
      summary,
      productContext: '',
      existing: '- `src/a.ts`',
      conventions: '',
      dataModel: '',
      api: '',
      risks: '',
      assumptions: [],
      openQuestions: [],
    });
    writeBrief(root, submitted(undefined, { mapId: 'm1', sections: sections('Careful plan'), author: 'claude-01' }));
    const hash = (await call(h, 'GET', '/briefs?mapId=m1')).body.hash;
    writeBrief(
      root,
      submitted(readBrief(root, 'm1'), { mapId: 'm1', sections: sections('Anything goes'), author: 'claude-01' }),
    );
    expect((await call(h, 'POST', '/briefs/accept', { mapId: 'm1' })).status).toBe(400);
    expect((await call(h, 'POST', '/briefs/accept', { mapId: 'm1', hash })).status).toBe(409);
    expect(readBrief(root, 'm1')?.status).toBe('submitted');
  });
});

describe('confirming knowledge binds to what was shown', () => {
  const h: Handler = (req, res, url) => handleKnowledge(root, req, res, url);
  it('refuses an entry edited while the human read it', async () => {
    const entry = (body: string) => ({
      id: 'K-1',
      title: 'Deploys',
      body,
      kind: 'convention' as const,
      status: 'suggested' as const,
      scope: [],
      tags: [],
      sources: [],
      anchors: [],
      createdBy: 'claude-01',
      createdAt: 1,
      updatedAt: 1,
    });
    writeKnowledge(root, entry('Deploy from CI'));
    const hash = (await call(h, 'GET', '/knowledge')).body.hashes['K-1'];
    writeKnowledge(root, entry('Push to main directly'));
    const confirm = (extra: object) =>
      call(h, 'POST', '/knowledge/call', { id: 'K-1', call: { kind: 'confirm' }, ...extra });
    expect((await confirm({})).status).toBe(400);
    expect((await confirm({ hash })).status).toBe(409);
    expect(readKnowledge(root, 'K-1')?.status).toBe('suggested');
  });
});

describe('confirming an assumption binds to the text shown', () => {
  it('refuses when the text changed', async () => {
    const { map: m } = await chartMap(adapter, {
      title: 'R',
      sections: {
        destination: 'D',
        notes: '',
        decisions: [],
        unspecified: [],
        outOfScope: [],
        assumptions: [{ id: 'S-1', text: 'Push is on', status: 'holding', tickets: [] }],
      },
      tickets: [],
    });
    const h: Handler = (req, res, url) => handleReroutes({ root, active: async () => adapter }, req, res, url);
    expect((await call(h, 'POST', '/assumptions/confirm', { mapId: m.id, id: 'S-1' })).status).toBe(400);
    expect((await call(h, 'POST', '/assumptions/confirm', { mapId: m.id, id: 'S-1', text: 'SMS is on' })).status).toBe(
      409,
    );
    expect((await call(h, 'POST', '/assumptions/confirm', { mapId: m.id, id: 'S-1', text: 'Push is on' })).status).toBe(
      200,
    );
  });
});
