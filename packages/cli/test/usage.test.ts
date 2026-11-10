import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readAgentDocs } from '@teamtrail/core/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrailAgent } from '../src/mcp/agent';
import { createMcpServer } from '../src/mcp/server';
import { installClaudeHook, recordClaudeSession } from '../src/usage/hook';
import { claudeTranscriptParser, codexRolloutParser, readLog, type UsageEvent } from '../src/usage/logs';
import { UsageMeter, claudeProjectDirName } from '../src/usage/meter';
import { priceUsage, rateFor } from '../src/usage/pricing';

/**
 * Fixtures were recorded from real Claude Code 2.1.316 (`claude -p`) and Codex
 * 0.166.0 (`codex exec`) runs driving `teamtrail mcp`, with the model API served by
 * a local stub that returns scripted usage: the transcript, rollout, hook payload
 * and MCP requests (with arrival times) are exactly what the agents wrote and sent.
 */
const FIX = path.join(__dirname, 'fixtures', 'usage');
const CLAUDE_SESSION = '81992f3f-19cb-43b1-ac68-e6f559e0d696';
const CLAUDE_TRANSCRIPT = path.join(FIX, 'claude', `${CLAUDE_SESSION}.jsonl`);
const CODEX_THREAD = '01a192e3-57d0-73f1-a6e2-cc5c2d20ee19';
const CODEX_ROLLOUT = path.join(FIX, 'codex', `rollout-2026-10-31T16-55-35-${CODEX_THREAD}.jsonl`);

const total = (es: UsageEvent[]) =>
  es.reduce(
    (a, e) => ({
      input: a.input + e.input,
      cacheRead: a.cacheRead + e.cacheRead,
      output: a.output + e.output,
      costUsd: a.costUsd + e.costUsd,
    }),
    { input: 0, cacheRead: 0, output: 0, costUsd: 0 },
  );

const calls = (agent: 'claude' | 'codex') =>
  fs
    .readFileSync(path.join(FIX, agent, 'mcp-calls.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(
      (l) =>
        JSON.parse(l) as {
          at: number;
          msg: { params: { name: string; arguments: Record<string, unknown>; _meta: Record<string, unknown> } };
        },
    );

let tmp: string;
const open: { close(): void | Promise<void> }[] = [];
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-usage-'));
});
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
  vi.useRealTimers();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Claude Code transcript', () => {
  it('sums each API message once and prices it like Claude Code does', () => {
    const events = readLog(CLAUDE_TRANSCRIPT, claudeTranscriptParser());
    const byKey = new Map(events.map((e) => [e.key, e]));
    expect(events.length).toBe(9);
    expect(byKey.size).toBe(7);
    const t = total([...byKey.values()]);
    const own = JSON.parse(fs.readFileSync(path.join(FIX, 'claude', 'print-result.json'), 'utf8'));
    expect(t.input).toBe(
      own.usage.input_tokens + own.usage.cache_creation_input_tokens + own.usage.cache_read_input_tokens,
    );
    expect(t.cacheRead).toBe(own.usage.cache_read_input_tokens);
    expect(t.output).toBe(own.usage.output_tokens);
    expect(t.costUsd).toBeCloseTo(own.total_cost_usd, 9);
  });

  it('remembers which tool_use ids it saw and when their message began', () => {
    const p = claudeTranscriptParser();
    readLog(CLAUDE_TRANSCRIPT, p);
    const ids = calls('claude').map((c) => c.msg.params._meta['claudecode/toolUseId'] as string);
    for (const id of ids) expect(p.calls.has(id)).toBe(true);
  });

  it('uses costUSD when an older transcript recorded it, and skips synthetic messages', () => {
    const p = claudeTranscriptParser();
    const rec = (model: string, extra = {}) => ({
      type: 'assistant',
      timestamp: '2026-01-01T00:00:00Z',
      requestId: 'r',
      costUSD: 0.5,
      ...extra,
      message: { id: `m-${model}`, model, usage: { input_tokens: 10, output_tokens: 5 } },
    });
    expect(p.line(rec('claude-sonnet-4-20250514'))?.costUsd).toBe(0.5);
    expect(p.line(rec('<synthetic>'))).toBeUndefined();
  });
});

describe('Codex rollout', () => {
  const lines = () =>
    fs
      .readFileSync(CODEX_ROLLOUT, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  const last = () =>
    lines()
      .filter((o) => o.payload?.type === 'token_count')
      .at(-1).payload.info.total_token_usage;

  it('reads one event per model response from token_usage_record', () => {
    const events = readLog(CODEX_ROLLOUT, codexRolloutParser());
    expect(events.length).toBe(7);
    expect(events.every((e) => e.key.startsWith('r:') && e.model === 'gpt-5-codex')).toBe(true);
    const t = total(events);
    expect({ input: t.input, cacheRead: t.cacheRead, output: t.output }).toEqual({
      input: last().input_tokens,
      cacheRead: last().cached_input_tokens,
      output: last().output_tokens,
    });
    expect(t.costUsd).toBeCloseTo(
      ((last().input_tokens - last().cached_input_tokens) * 1.25 +
        last().cached_input_tokens * 0.125 +
        last().output_tokens * 10) /
        1e6,
      9,
    );
  });

  it('falls back to running token_count totals (older Codex) and ignores repeated counts', () => {
    const p = codexRolloutParser();
    const events: UsageEvent[] = [];
    for (const o of lines().filter((x) => x.type !== 'token_usage_record')) {
      const e = p.line(o);
      if (e) events.push(e);
      if (o.payload?.type === 'token_count') expect(p.line(o)).toBeUndefined();
    }
    expect(events.length).toBe(7);
    expect(total(events).input).toBe(last().input_tokens);
    expect(total(events).output).toBe(last().output_tokens);
  });
});

describe('pricing', () => {
  it('knows current Claude and OpenAI list prices', () => {
    expect(rateFor('claude-sonnet-4-5')).toMatchObject({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
    expect(rateFor('claude-opus-4-5-20251101')).toMatchObject({ input: 5, output: 25 });
    expect(rateFor('claude-opus-4-1-20250805')).toMatchObject({ input: 15, output: 75 });
    expect(rateFor('claude-haiku-4-5')).toMatchObject({ input: 1, output: 5 });
    expect(rateFor('gpt-5-codex')).toMatchObject({ input: 1.25, output: 10, cacheRead: 0.125 });
    expect(rateFor('gpt-5.1-codex-mini')).toMatchObject({ input: 0.25 });
    expect(rateFor('some-local-model')).toBeUndefined();
    expect(priceUsage('some-local-model', { input: 1000, cacheRead: 0, cacheWrite: 0, output: 10 })).toBe(0);
  });
});

/** An MCP server wired to a usage meter, driven by the recorded MCP requests at their recorded times. */
async function replay(meter: UsageMeter, agent: 'claude' | 'codex', clientName: string) {
  const root = path.join(tmp, 'tracker');
  let server: ReturnType<typeof createMcpServer> | undefined;
  const trail = new TrailAgent({
    root,
    pollMs: 20,
    usage: meter,
    client: () => {
      const v = server?.server.getClientVersion();
      return v && `${v.name} ${v.version}`;
    },
  });
  server = createMcpServer(trail, '0.0.0-test');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: clientName, version: '1.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  open.push({ close: () => trail.close() }, client);
  vi.useFakeTimers({ toFake: ['Date'] });
  const results: Record<string, unknown>[] = [];
  for (const c of calls(agent)) {
    vi.setSystemTime(c.at);
    const r = (await client.callTool({
      name: c.msg.params.name,
      arguments: c.msg.params.arguments,
      _meta: c.msg.params._meta,
    })) as { isError?: boolean; content: { text: string }[] };
    if (r.isError) throw new Error(r.content[0].text);
    results.push(JSON.parse(r.content[0].text));
  }
  const sessions = (await readAgentDocs(root, { recentMs: 10 * 365 * 86_400_000 }))
    .map((d) => d.session)
    .sort((x, y) => x.startedAt - y.startedAt);
  return { sessions, results, trail, root };
}

/** Per-session usage the real runs ended with (session docs written by `teamtrail mcp`). */
const CLAUDE_EXPECTED = [
  {
    mode: 'chart',
    usage: {
      inputTokens: 21009,
      outputTokens: 410,
      costUsd: 0.084927,
      cachedInputTokens: 0,
      source: 'claude-code',
      models: ['claude-sonnet-4-5'],
    },
  },
  {
    mode: 'research',
    usage: {
      inputTokens: 69415,
      outputTokens: 915,
      costUsd: 0.045285,
      cachedInputTokens: 66300,
      source: 'claude-code',
      models: ['claude-sonnet-4-5'],
    },
  },
  {
    mode: 'research',
    usage: {
      inputTokens: 49312,
      outputTokens: 228,
      costUsd: 0.020661,
      cachedInputTokens: 48600,
      source: 'claude-code',
      models: ['claude-sonnet-4-5'],
    },
  },
];
const CODEX_EXPECTED = [
  {
    mode: 'chart',
    usage: {
      inputTokens: 12000,
      outputTokens: 800,
      costUsd: 0.023,
      cachedInputTokens: 0,
      source: 'codex',
      models: ['gpt-5-codex'],
    },
  },
  {
    mode: 'research',
    usage: {
      inputTokens: 42300,
      outputTokens: 940,
      costUsd: 0.018738,
      cachedInputTokens: 38700,
      source: 'codex',
      models: ['gpt-5-codex'],
    },
  },
  {
    mode: 'research',
    usage: {
      inputTokens: 31600,
      outputTokens: 180,
      costUsd: 0.006875,
      cachedInputTokens: 30600,
      source: 'codex',
      models: ['gpt-5-codex'],
    },
  },
];

describe('usage attributed to teamtrail sessions', () => {
  it('Claude Code: finds the transcript by tool_use id and splits usage per session; reported numbers are ignored', async () => {
    const project = path.join(tmp, 'project');
    const config = path.join(tmp, 'claude-config');
    const dir = path.join(config, 'projects', claudeProjectDirName(project));
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(CLAUDE_TRANSCRIPT, path.join(dir, `${CLAUDE_SESSION}.jsonl`));
    fs.writeFileSync(path.join(dir, 'other-session.jsonl'), '{"type":"user"}\n');
    const meter = new UsageMeter({
      root: path.join(tmp, 'tracker'),
      env: { CLAUDE_CONFIG_DIR: config, CLAUDE_PROJECT_DIR: project },
      home: tmp,
    });
    const { sessions, results } = await replay(meter, 'claude', 'claude-code');
    expect(meter.attached.files).toEqual([path.join(dir, `${CLAUDE_SESSION}.jsonl`)]);
    expect(sessions.map((s) => ({ mode: s.mode, usage: s.usage }))).toEqual(CLAUDE_EXPECTED);
    const report = results[2] as { usageSource: string; session: { usage: { costUsd: number } } };
    expect(report.usageSource).toMatch(/^claude-code logs/);
    expect(report.session.usage.costUsd).toBeLessThan(1);
  });

  it('Claude Code: reads the model the agent runs on and stamps its tier on the sessions', async () => {
    const project = path.join(tmp, 'project');
    const config = path.join(tmp, 'claude-config');
    const dir = path.join(config, 'projects', claudeProjectDirName(project));
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(CLAUDE_TRANSCRIPT, path.join(dir, `${CLAUDE_SESSION}.jsonl`));
    const meter = new UsageMeter({
      root: path.join(tmp, 'tracker'),
      env: { CLAUDE_CONFIG_DIR: config, CLAUDE_PROJECT_DIR: project },
      home: tmp,
    });
    const { sessions } = await replay(meter, 'claude', 'claude-code');
    expect(meter.model()).toBe('claude-sonnet-4-5');
    expect(sessions.at(-1)).toMatchObject({ model: 'claude-sonnet-4-5', tier: 'balanced' });
  });

  it('Claude Code: the SessionStart hook link points at a transcript outside the default folder', async () => {
    const elsewhere = path.join(tmp, 'elsewhere', `${CLAUDE_SESSION}.jsonl`);
    fs.mkdirSync(path.dirname(elsewhere), { recursive: true });
    fs.copyFileSync(CLAUDE_TRANSCRIPT, elsewhere);
    const project = path.join(tmp, 'project');
    const payload = {
      ...JSON.parse(fs.readFileSync(path.join(FIX, 'claude', 'session-start.json'), 'utf8')),
      session_id: CLAUDE_SESSION,
      transcript_path: elsewhere,
      cwd: project,
    };
    const link = recordClaudeSession(JSON.stringify(payload), {
      dir: '../tracker',
      env: { CLAUDE_PROJECT_DIR: project },
    });
    expect(link).toBe(path.join(tmp, 'tracker', '.agents', 'hosts', `claude-code-${CLAUDE_SESSION}.json`));
    expect(recordClaudeSession('not json', { dir: '.' })).toBeUndefined();
    const meter = new UsageMeter({ root: path.join(tmp, 'tracker'), env: {}, home: tmp, cwd: project });
    const { sessions } = await replay(meter, 'claude', 'claude-code');
    expect(meter.attached.files).toEqual([elsewhere]);
    expect(sessions.map((s) => s.usage?.costUsd)).toEqual(CLAUDE_EXPECTED.map((e) => e.usage.costUsd));
  });

  it('Codex: finds the rollout by the threadId in _meta and splits usage per session', async () => {
    const day = path.join(tmp, '.codex', 'sessions', '2026', '10', '31');
    fs.mkdirSync(day, { recursive: true });
    fs.copyFileSync(CODEX_ROLLOUT, path.join(day, path.basename(CODEX_ROLLOUT)));
    const meter = new UsageMeter({ root: path.join(tmp, 'tracker'), env: {}, home: tmp });
    const { sessions, trail } = await replay(meter, 'codex', 'codex-mcp-client');
    expect(meter.attached).toEqual({ source: 'codex', files: [path.join(day, path.basename(CODEX_ROLLOUT))] });
    expect(sessions.map((s) => ({ mode: s.mode, usage: s.usage }))).toEqual(CODEX_EXPECTED);
    const status = await trail.status();
    expect(status.trail?.spend).toMatchObject({ costUsd: 0.0486, sources: ['codex'] });
  });

  it('falls back to the numbers the agent reports when no log is found, and marks them', async () => {
    const meter = new UsageMeter({ root: path.join(tmp, 'tracker'), env: {}, home: tmp });
    const { sessions, results } = await replay(meter, 'codex', 'codex-mcp-client');
    expect(meter.attached.source).toBeUndefined();
    expect(sessions.map((s) => s.usage)).toEqual([
      undefined,
      { inputTokens: 5, outputTokens: 5, costUsd: 5, source: 'reported' },
      undefined,
    ]);
    expect((results[2] as { usageSource: string }).usageSource).toBe('reported');
  });
});

describe('connect claude', () => {
  it('adds the SessionStart hook once, keeps other settings, and replaces an older teamtrail hook', () => {
    const file = path.join(tmp, '.claude', 'settings.local.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        permissions: { allow: ['Bash(ls)'] },
        hooks: {
          SessionStart: [
            {
              hooks: [
                { type: 'command', command: 'echo hi' },
                { type: 'command', command: 'npx teamtrail hook claude --dir old' },
              ],
            },
          ],
          Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }],
        },
      }),
    );
    const self = { command: 'npx', args: ['-y', 'teamtrail@0.25.0'], pinned: 'teamtrail@0.25.0' };
    expect(installClaudeHook(file, undefined, self)).toBe('updated');
    expect(installClaudeHook(file, undefined, self)).toBe('unchanged');
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(s.permissions).toEqual({ allow: ['Bash(ls)'] });
    expect(s.hooks.Stop).toHaveLength(1);
    expect(s.hooks.SessionStart).toEqual([
      { hooks: [{ type: 'command', command: 'echo hi' }] },
      { hooks: [{ type: 'command', command: 'npx -y teamtrail@0.25.0 hook claude', timeout: 30 }] },
    ]);
    installClaudeHook(file, 'plans', self);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).hooks.SessionStart[1].hooks[0].command).toBe(
      'npx -y teamtrail@0.25.0 hook claude --dir plans',
    );
  });
});
