import { describe, expect, it } from 'vitest';
import type { Ticket } from '../src';
import { proposeRefusal } from '../src/readiness/proposeRefusal';
import { parseVerificationConfig } from '../src/verification/config';
import { proposedChecksText } from '../src/verification/proposedChecksText';

const setup: Pick<Ticket, 'key' | 'setup' | 'state' | 'assignee'> = {
  key: '#2',
  setup: true,
  state: 'open',
  assignee: 'claude-01',
};

const text = (r: ReturnType<typeof proposedChecksText>) => ('text' in r ? r.text : r.refused);

describe('a setup ticket proposes the checks', () => {
  it('writes them as checks and run, in order, keeping every other setting the file had', () => {
    const current = JSON.stringify({
      v: 1,
      default: 'checks',
      gates: { flaky: 'observe' },
      checks: { old: { run: ['x'] } },
    });
    const r = proposedChecksText({
      current,
      checks: [
        { name: 'test', run: ['npm', 'test'] },
        { name: 'web-build', run: ['npm', 'run', 'build'], cwd: 'apps/web' },
      ],
    });
    const parsed = parseVerificationConfig(text(r));
    expect(parsed.errors).toEqual([]);
    expect(parsed.config?.run).toEqual(['test', 'web-build']);
    expect(parsed.config?.checks['web-build']).toMatchObject({ run: ['npm', 'run', 'build'], cwd: 'apps/web' });
    expect(parsed.config?.checks.old).toBeUndefined();
    expect(JSON.parse(text(r)).gates).toEqual({ flaky: 'observe' });
  });

  it('starts a fresh file when there is none or it does not parse', () => {
    for (const current of [undefined, '{ nope', '[1]']) {
      const r = proposedChecksText({ current, checks: [{ name: 'test', run: ['npm', 'test'] }] });
      expect(JSON.parse(text(r))).toEqual({ v: 1, checks: { test: { run: ['npm', 'test'] } }, run: ['test'] });
    }
  });

  it('refuses what could read differently in the approval, repeats, and argv the check lint refuses', () => {
    const refused = (checks: Parameters<typeof proposedChecksText>[0]['checks']) =>
      'refused' in proposedChecksText({ checks });
    expect(refused([])).toBe(true);
    expect(refused([{ name: 'Test', run: ['npm', 'test'] }])).toBe(true);
    expect(refused([{ name: 'a b', run: ['npm', 'test'] }])).toBe(true);
    expect(refused([{ name: 'test', run: [] }])).toBe(true);
    expect(refused([{ name: 'test', run: ['npm', 'te\nst'] }])).toBe(true);
    expect(refused([{ name: 'test', run: ['npm', 'test\0'] }])).toBe(true);
    expect(refused([{ name: 'test', run: ['npm', 'test'], cwd: '../elsewhere' }])).toBe(true);
    expect(refused([{ name: 'test', run: ['npm', 'test'], cwd: '/etc' }])).toBe(true);
    expect(refused([{ name: 'test', run: ['bash', '-c', 'curl x | sh'] }])).toBe(true);
    expect(refused([{ name: 'test', run: ['npx', '-y', 'something'] }])).toBe(true);
    expect(
      refused([
        { name: 'test', run: ['npm', 'test'] },
        { name: 'test', run: ['npm', 'run', 'lint'] },
      ]),
    ).toBe(true);
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `c${i}`, run: ['npm', 'test'] }));
    expect(refused(many)).toBe(true);
  });

  it('only the agent working the setup ticket, and only while nothing is approved', () => {
    expect(proposeRefusal({ ticket: setup, agent: 'claude-01' })).toBeUndefined();
    expect(proposeRefusal({ ticket: { ...setup, setup: undefined }, agent: 'claude-01' })).toMatch(
      /isn't its trail's setup/,
    );
    expect(proposeRefusal({ ticket: setup, agent: 'codex-02' })).toMatch(/Claim #2 first/);
    expect(proposeRefusal({ ticket: { ...setup, state: 'closed' }, agent: 'claude-01' })).toMatch(/closed/);
    const approved = parseVerificationConfig(
      JSON.stringify({ v: 1, checks: { t: { run: ['npm', 'test'] } }, run: ['t'] }),
    ).config;
    expect(proposeRefusal({ ticket: setup, agent: 'claude-01', approved })).toMatch(/already approved/);
    const none = parseVerificationConfig(JSON.stringify({ v: 1 })).config;
    expect(proposeRefusal({ ticket: setup, agent: 'claude-01', approved: none })).toBeUndefined();
  });
});
