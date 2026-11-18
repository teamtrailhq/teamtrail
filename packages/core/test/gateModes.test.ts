import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { journalFile } from '../src/history/journalFile';
import { DEFAULT_GATES } from '../src/model/gateMode';
import { parseVerificationConfig } from '../src/verification/config';
import { gateModeFor } from '../src/verification/gateModeFor';
import { recordGate } from '../src/verification/recordGate';

const parse = (extra: object) => parseVerificationConfig(JSON.stringify({ v: 1, ...extra }));
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('verification gates', () => {
  it('takes the defaults for gates the file leaves out', () => {
    const { config } = parse({ gates: { flaky: 'observe' } });
    expect(config?.gates).toEqual({ ...DEFAULT_GATES, flaky: 'observe' });
    expect(gateModeFor(config, 'check-guard')).toBe(DEFAULT_GATES['check-guard']);
    expect(gateModeFor(config, 'flaky')).toBe('observe');
  });

  it('is off without a config', () => {
    expect(gateModeFor(undefined, 'check-guard')).toBe('off');
  });

  it('refuses unknown gates and modes', () => {
    expect(parse({ gates: { nope: 'off' } }).errors).toEqual(['"gates" names unknown gate "nope"']);
    expect(parse({ gates: { flaky: 'loud' } }).errors).toEqual(['"gates.flaky" must be off, observe, enforce']);
    expect(parse({ gates: [] }).errors).toEqual(['"gates" must be an object']);
  });

  it('journals what a gate held back or would have, and nothing when off', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gates-'));
    dirs.push(root);
    const base = { root, mapId: 'm1', gate: 'flaky' as const, reason: 'npm test failed, then passed on abc123' };
    expect(recordGate({ ...base, mode: 'off' })).toBe(false);
    expect(recordGate({ ...base, mode: 'observe', ticket: { id: '4', key: '#4' }, now: 1 })).toBe(false);
    expect(recordGate({ ...base, mode: 'enforce', now: 2 })).toBe(true);
    const gates = journalFile(root).readGates('m1');
    expect(gates.map((g) => [g.mode, g.ticketKey])).toEqual([
      ['observe', '#4'],
      ['enforce', undefined],
    ]);
    expect(journalFile(root).readAll('m1')).toEqual([]);
  });
});
