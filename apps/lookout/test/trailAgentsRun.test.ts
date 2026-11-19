import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  PENDING_LIMIT_MS,
  PENDING_POLL_MS,
  trailAgentsRun,
  type TrailAgentsRunView,
} from '../src/features/trail/trailAgentsRun';
import { trailAgentsStatus } from '../src/features/trail/trailAgentsStatus';
import { learnManagedSignIn } from '../src/lib/managedSignIn';

const origin = 'https://demo.example.test';

/** A server that runs agents: Start and Pause switch them, runs begin and end only when the test says. */
function fakeServer() {
  const s = {
    on: false,
    running: 0,
    note: undefined as string | undefined,
    down: false,
    refuse: undefined as string | undefined,
  };
  const body = () => ({
    canRun: true,
    repos: ['ada/site'],
    on: s.on,
    running: s.running,
    ...(s.note ? { note: s.note } : {}),
  });
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (s.down) throw new Error('offline');
    if (init?.method === 'POST') {
      if (s.refuse) return new Response(JSON.stringify({ error: s.refuse }), { status: 409 });
      s.on = (JSON.parse(String(init.body)) as { on: boolean }).on;
    }
    return new Response(JSON.stringify(body()));
  });
  return s;
}

/** The control over one trail, with every view it showed. */
async function control() {
  const views: TrailAgentsRunView[] = [];
  const run = trailAgentsRun({ mapId: 'launch', onChange: (v) => views.push(v) });
  await vi.advanceTimersByTimeAsync(0);
  return { run, last: () => run.view() };
}

describe('Start and Pause wait for the server to report the run began or ended', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { href: `${origin}/`, origin });
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('window', { dispatchEvent: () => true });
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], trailAgents: '/_cloud/agents/trail' } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('after Pause it shows Stopping… while a run goes on, then Start once the server says it ended', async () => {
    const server = fakeServer();
    server.on = true;
    server.running = 1;
    const { run, last } = await control();
    expect(last().pending).toBeUndefined();
    await run.act(false);
    expect(last().state?.on).toBe(false);
    expect(last().pending).toBe('stopping');
    expect(trailAgentsStatus(last().state!, last().pending)).toBe('Agents · stopping, 1 still working');
    await vi.advanceTimersByTimeAsync(PENDING_POLL_MS);
    expect(last().pending).toBe('stopping');
    server.running = 0;
    await vi.advanceTimersByTimeAsync(PENDING_POLL_MS);
    expect(last().pending).toBeUndefined();
    expect(last().error).toBeUndefined();
    run.dispose();
  });

  test('a reload while agents still stop shows Stopping… too: it comes from the server, not this page', async () => {
    const server = fakeServer();
    server.running = 2;
    const { run, last } = await control();
    expect(last().pending).toBe('stopping');
    run.dispose();
  });

  test('after Start it shows Starting… until a run is reported', async () => {
    const server = fakeServer();
    const { run, last } = await control();
    expect(await run.act(true)).toBe(true);
    expect(last().pending).toBe('starting');
    expect(trailAgentsStatus(last().state!, last().pending)).toBe('Agents · starting…');
    await vi.advanceTimersByTimeAsync(PENDING_POLL_MS);
    expect(last().pending).toBe('starting');
    server.running = 1;
    await vi.advanceTimersByTimeAsync(PENDING_POLL_MS);
    expect(last().pending).toBeUndefined();
    expect(last().state?.running).toBe(1);
    run.dispose();
  });

  test("Starting… gives way to the server's word on why none goes", async () => {
    const server = fakeServer();
    const { run, last } = await control();
    await run.act(true);
    server.note = 'No ticket is ready yet.';
    await vi.advanceTimersByTimeAsync(PENDING_POLL_MS);
    expect(last().pending).toBeUndefined();
    expect(trailAgentsStatus(last().state!)).toBe('Agents · No ticket is ready yet.');
    run.dispose();
  });

  test('a refused Start or Pause says why and changes nothing', async () => {
    const server = fakeServer();
    const { run, last } = await control();
    server.refuse = 'Connect a repository first.';
    expect(await run.act(true)).toBe(false);
    expect(last()).toMatchObject({ busy: false, error: 'Connect a repository first.', pending: undefined });
    expect(last().state?.on).toBe(false);
    run.dispose();
  });

  test('losing the server while stopping says so, and the next answer clears it', async () => {
    const server = fakeServer();
    server.on = true;
    server.running = 1;
    const { run, last } = await control();
    await run.act(false);
    server.down = true;
    await vi.advanceTimersByTimeAsync(PENDING_POLL_MS);
    expect(last().pending).toBe('stopping');
    expect(last().error).toMatch(/Couldn't reach the server to see whether the agents stopped/);
    server.down = false;
    server.running = 0;
    await vi.advanceTimersByTimeAsync(PENDING_POLL_MS);
    expect(last()).toMatchObject({ pending: undefined, error: undefined });
    run.dispose();
  });

  test('a run that never ends, or never starts, is said to take long rather than waited on in silence', async () => {
    const server = fakeServer();
    server.on = true;
    server.running = 1;
    const { run, last } = await control();
    await run.act(false);
    await vi.advanceTimersByTimeAsync(PENDING_LIMIT_MS + PENDING_POLL_MS);
    expect(last().pending).toBe('stopping');
    expect(last().error).toMatch(/haven't stopped yet: 1 still running/);
    server.running = 0;
    await vi.advanceTimersByTimeAsync(PENDING_POLL_MS);
    await run.act(true);
    await vi.advanceTimersByTimeAsync(PENDING_LIMIT_MS + PENDING_POLL_MS);
    expect(last().pending).toBe('starting');
    expect(last().error).toMatch(/No agent has started yet/);
    run.dispose();
  });
});
