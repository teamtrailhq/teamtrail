import type { GateEntry } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { summarizeGates } from '../src/features/gates/summarizeGates';

const entry = (o: Partial<GateEntry> & Pick<GateEntry, 'gate' | 'mode' | 'at'>): GateEntry => ({
  v: 1,
  kind: 'gate',
  mapId: 'm',
  reason: 'why',
  actor: 'teamtrail',
  actorKind: 'engine',
  ...o,
});

describe('summarizeGates', () => {
  it('lists every known gate with nothing when nothing fired', () => {
    expect(summarizeGates([])).toEqual([
      { gate: 'check-guard', held: 0, wouldHold: 0, entries: [] },
      { gate: 'independent-review', held: 0, wouldHold: 0, entries: [] },
      { gate: 'diff-rules', held: 0, wouldHold: 0, entries: [] },
      { gate: 'flaky', held: 0, wouldHold: 0, entries: [] },
    ]);
  });

  it('counts each ticket once per mode, newest first, and keeps gates it does not know', () => {
    const rows = summarizeGates([
      entry({ gate: 'flaky', mode: 'observe', at: 1, ticketId: '1' }),
      entry({ gate: 'flaky', mode: 'observe', at: 3, ticketId: '1' }),
      entry({ gate: 'flaky', mode: 'observe', at: 2, ticketId: '2' }),
      entry({ gate: 'flaky', mode: 'enforce', at: 4, ticketId: '1' }),
      entry({ gate: 'flaky', mode: 'enforce', at: 5 }),
      entry({ gate: 'tests-added' as never, mode: 'observe', at: 6, ticketId: '9' }),
    ]);
    const flaky = rows.find((r) => r.gate === 'flaky')!;
    expect(flaky).toMatchObject({ held: 2, wouldHold: 2 });
    expect(flaky.entries.map((e) => e.at)).toEqual([5, 4, 3, 2, 1]);
    expect(rows.at(-1)).toMatchObject({ gate: 'tests-added', held: 0, wouldHold: 1 });
  });
});
