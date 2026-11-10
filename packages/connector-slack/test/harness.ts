import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentSessionDoc, ChatMessage, PendingQuestion, TrackerAdapter } from '@teamtrail/core';
import { writeJsonAtomic } from '@teamtrail/core/bridge';
import { FIXTURES, recorder, replay, type Fixture } from '../../core/test/fixtures';
import { BOT_SCOPES, OPTIONAL_SCOPES } from '../src/manifest';
import { SlackService, type SlackServiceOptions } from '../src/service';
import { fakeSlack, type FakeSlack } from './fakes/slack';
import { socketHub } from './fakes/socket';

export { FROZEN, freezeTime } from '../../core/test/scenarios';

/** The fake's tokens: test values only, never real credentials. */
export const TOKENS = {
  app: 'xapp-1-A0Scout0001-1001-6d696c6f6170706c6576656c',
  bot: 'xoxb-1001-2002-fakebottokenscout',
  user: 'xoxp-1001-2002-fakeusertoken',
};
export const ANA = 'U0ANA0001';
export const RAJ = 'U0RAJ0001';
export const EVE = 'U0EVE0001';
export const URL_ = 'http://localhost:7420/';

type Env = { type: string; payload: unknown };
export interface SlackFixture extends Fixture {
  envelopes: (Env & { label: string; ack?: unknown })[];
}

/** One flow's world: a temp tracker + config dir, Slack (fake when recording, fixture when replaying) and a socket hub. */
export function world(mode: 'record' | 'replay', name: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-slack-'));
  const root = path.join(dir, 'tracker');
  const configDir = path.join(dir, 'config');
  mkdirSync(root, { recursive: true });
  const fake = mode === 'record' ? fakeSlack() : undefined;
  const rec = fake ? recorder(fake.fetch) : undefined;
  const rp = mode === 'replay' ? replay(name) : undefined;
  const fx = rp?.fixture as SlackFixture | undefined;
  const hub = socketHub();
  const envelopes: SlackFixture['envelopes'] = [];
  let next = 0;
  const services: SlackService[] = [];
  return {
    fake,
    hub,
    root,
    configDir,
    fetch: (rec?.fetch ?? rp!.fetch) as typeof fetch,
    /** Every Web API call and response_url post so far (while recording against the fake). */
    exchanges: () => rec?.exchanges ?? [],
    service(adapter: TrackerAdapter, extra: Partial<SlackServiceOptions> = {}) {
      const s = new SlackService({
        root,
        configDir,
        active: async () => adapter,
        url: () => URL_,
        env: {},
        fetch: this.fetch,
        WebSocket: hub.WebSocket,
        apiUrl: 'https://slack.test/api',
        pollMs: 0,
        batchMs: 0,
        trailEvery: 1,
        backoffMs: () => 0,
        sleep: async () => {},
        lockOwner: `${name}:${services.length}`,
        ownerEmail: () => undefined,
        ownerCode: () => CODE,
        ...extra,
      });
      services.push(s);
      return s;
    },
    /** Delivers what Slack sends for a user action; `build` runs only while recording (it reads the fake's state). */
    async send(svc: SlackService, label: string, build: (f: FakeSlack) => Env) {
      const recorded = fx?.envelopes[next++];
      let env: Env;
      if (fake) env = build(fake);
      else {
        assert.ok(recorded, `${name}: no recorded envelope for "${label}"`);
        assert.equal(recorded.label, label, `${name}: envelope order differs`);
        env = { type: recorded.type, payload: recorded.payload };
      }
      const ack = await hub.envelope(env);
      await svc.idle();
      if (fake) envelopes.push({ label, ...env, ...(ack === undefined ? {} : { ack }) });
      else assert.deepEqual(ack, recorded!.ack, `${name}: ack for "${label}" differs from the fixture`);
      return ack;
    },
    save(notes: string) {
      const out: SlackFixture = {
        source: 'fake',
        recordedAt: new Date().toISOString(),
        notes,
        exchanges: rec!.exchanges,
        envelopes,
      };
      writeFileSync(path.join(FIXTURES, name), JSON.stringify(out, null, 2) + '\n');
    },
    done() {
      rp?.done();
      if (fx)
        assert.equal(
          next,
          fx.envelopes.length,
          `${name}: ${fx.envelopes.length - next} recorded envelopes were never sent`,
        );
    },
    cleanup() {
      for (const s of services) s.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
export type World = ReturnType<typeof world>;

/** The code the trail lead reads in the Lookout, fixed so recorded envelopes replay. */
export const CODE = 'K7QF2M9X';

/** A finished setup, as `pasteToken` + the confirmed owner leave it. `legacy` writes owners as older versions did. */
export function connected(
  w: World,
  o: {
    owners?: string[];
    allow?: string[];
    notify?: Record<string, unknown>;
    legacy?: 'home' | 'git-email' | 'unmarked';
  } = {},
) {
  const how = (): Record<string, unknown> => {
    if (o.legacy === 'unmarked') return {};
    if (o.legacy) return { via: o.legacy };
    return { via: 'code', confirmedAt: 1 };
  };
  writeJsonAtomic(path.join(w.configDir, 'credentials.json'), {
    slack: { appToken: TOKENS.app, botToken: TOKENS.bot },
  });
  writeJsonAtomic(path.join(w.configDir, 'slack.json'), {
    enabled: true,
    created: true,
    appId: 'A0Scout0001',
    workspace: { id: 'T0EFIKA01', name: 'efika', url: 'https://efika.slack.com/' },
    bot: { userId: 'U0ScoutBOT', name: 'scout' },
    owners: (o.owners ?? [ANA]).map((id) => ({ id, name: id === ANA ? 'ana' : id, ...how() })),
    allow: (o.allow ?? []).map((id) => ({ id })),
    ...(o.notify ? { notify: o.notify } : {}),
  });
}

/** A world on the in-memory fake, for tests that assert on what Slack was sent rather than on a fixture. */
export function liveWorld() {
  const w = world('record', 'unused.json');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Body = Record<string, any>;
  const bodies = (prefix: string) =>
    w
      .exchanges()
      .filter((e) => e.req.url.startsWith(prefix))
      .map((e) => (e.req.body ?? {}) as Body);
  return {
    w,
    fake: w.fake!,
    /** Request bodies of one Web API method, in order. */
    calls: (method: string) => bodies(`/api/${method}`),
    /** Every Web API method called, in order. */
    methods: () =>
      w
        .exchanges()
        .filter((e) => e.req.url.startsWith('/api/'))
        .map((e) => e.req.url.replace('/api/', '').replace(/\?.*$/, '')),
    /** Ephemeral replies posted to a response_url. */
    replies: () => bodies('/actions/'),
    lastView: () => [...w.fake!.views.keys()].at(-1)!,
  };
}
export type LiveWorld = ReturnType<typeof liveWorld>;

export async function until(cond: () => boolean, what = 'condition') {
  for (let i = 0; i < 500; i++) {
    if (cond()) return;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** What an agent's `teamtrail mcp` process writes while it waits on a human. */
export function agentDoc(
  root: string,
  o: {
    sid: string;
    mapId: string;
    ticketId?: string;
    agent?: string;
    pending?: Omit<PendingQuestion, 'sessionId' | 'mapId' | 'agent'>[];
    chats?: Omit<ChatMessage, 'sessionId'>[];
    status?: 'running' | 'done';
  },
) {
  const agent = o.agent ?? 'claude-07';
  const doc: AgentSessionDoc = {
    v: 1,
    session: {
      id: o.sid,
      agent,
      mode: 'work',
      mapId: o.mapId,
      ticketId: o.ticketId,
      step: 2,
      total: 5,
      stepLabel: 'Ask',
      status: o.status ?? 'running',
      startedAt: Date.now(),
      usage: { inputTokens: 1_200_000, outputTokens: 600_000, costUsd: 4.12 },
    },
    chats: (o.chats ?? []).map((c) => ({ ...c, sessionId: o.sid })),
    pending: (o.pending ?? []).map((q) => ({ ...q, sessionId: o.sid, mapId: o.mapId, agent })),
    answered: [],
    feed: [],
    pid: process.pid,
    updatedAt: Date.now(),
  };
  writeJsonAtomic(path.join(root, '.agents', 'sessions', `${o.sid}.json`), doc);
}

export const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
export const ALL_SCOPES: string[] = [...BOT_SCOPES, ...OPTIONAL_SCOPES];
