import { afterEach, describe, expect, test, vi } from 'vitest';
import { trailAgentsStatus } from '../src/features/trail/trailAgentsStatus';
import { learnManagedSignIn } from '../src/lib/managedSignIn';
import { readTrailAgents } from '../src/lib/trailAgents';

const origin = 'https://demo.example.test';
const base = { canRun: true, repos: ['ada/site'], on: true };

describe("the agents menu names the model they're on", () => {
  afterEach(() => vi.unstubAllGlobals());

  test('working, with the model when the server names one', () => {
    expect(trailAgentsStatus({ ...base, running: 1, model: 'Opus 5.5' })).toBe('Agents · 1 working · Opus 5.5');
    expect(trailAgentsStatus({ ...base, running: 2 })).toBe('Agents · 2 working');
    expect(trailAgentsStatus({ ...base, running: 0, model: 'Opus 5.5', note: 'Looking for ready work.' })).toBe(
      'Agents · Looking for ready work.',
    );
  });

  test("the server's model is kept as text, trimmed and short; anything else is dropped", async () => {
    vi.stubGlobal('location', { href: `${origin}/`, origin });
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    learnManagedSignIn({ managed: { name: 'Ada', pages: [], trailAgents: '/_cloud/agents/trail' } });
    const answer = (body: unknown) => vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body)));
    answer({ ...base, running: 1, model: ` ${'x'.repeat(100)} ` });
    expect((await readTrailAgents('launch'))?.model).toBe('x'.repeat(80));
    answer({ ...base, running: 1, model: 42 });
    expect((await readTrailAgents('launch'))?.model).toBeUndefined();
  });
});
