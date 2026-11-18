import type { VerificationAttempt } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from '../src/mcp/instructions';
import { settledView } from '../src/mcp/trail/verificationView';

const attempt = (mode: 'observe' | 'enforce'): VerificationAttempt => ({
  v: 1,
  id: 'A-2',
  mapId: 'm',
  ticketId: '1',
  ticketKey: '#1',
  agent: 'Scout-1',
  level: 'checks',
  configHash: 'h',
  submittedAt: 0,
  finishedAt: 0,
  resolution: 'r',
  checks: [],
  result: 'pass',
  flaky: {
    mode,
    checks: [{ name: 'test', argv: ['npm', 'test'], failedIn: 'A-1', failure: 'exited 1', head: 'abc1234567' }],
  },
});

describe('a pass only a retry got, as the agent sees it', () => {
  it('held: the human decides, and a retry is not a fix', () => {
    const v = settledView({ attempt: attempt('enforce'), phase: 'blocked', failures: 1, maxAttempts: 3 });
    expect(v).toMatchObject({
      status: 'blocked',
      flaky: ['test failed in A-1, then passed on abc1234 with no change'],
    });
    expect((v as { note: string }).note).toMatch(/A retry is not a fix/);
  });

  it('observed: done, still told the test is flaky', () => {
    const v = settledView({ attempt: attempt('observe'), phase: 'done', failures: 1, maxAttempts: 3 });
    expect(v).toMatchObject({ status: 'done', flaky: [expect.stringContaining('then passed')] });
  });

  it('agents are told never to rerun, sleep, retry or skip to get a pass', () => {
    expect(INSTRUCTIONS).toMatch(/Never close again on unchanged code to get a pass/);
    expect(INSTRUCTIONS).toMatch(/never add sleeps or retries or skip a test/);
  });
});
