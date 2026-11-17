import { describe, expect, it } from 'vitest';
import { ticketActionList } from '../src/features/inspector/ticketActionList';
import type { TicketRunners } from '../src/features/inspector/types';
import type { TicketView } from '../src/features/inspector/useTicketView';

const noop = () => {};
const run = new Proxy({}, { get: () => noop }) as TicketRunners;
const check = (name: string) => ({ name, argv: ['npm', name], hash: `sha256:${name}` });

/** The inspector's view of a ticket, as much of it as the action list reads. */
function view(o: { state: string; waivable?: string[]; waived?: string[] }) {
  const waivers = o.waived?.length ? [{ id: 'W-1', checks: o.waived.map((n) => ({ name: n, argv: [] })) }] : [];
  return {
    state: o.state,
    mine: false,
    items: [],
    t: { state: 'open', closeReason: undefined },
    criteria: { criteria: [] },
    verification: { attempts: [{ id: 'A-1' }], verdicts: [], waivable: (o.waivable ?? []).map(check), waivers },
  } as unknown as TicketView;
}

const ids = (v: TicketView) => ticketActionList(v, run).map((i) => [i.id, i.label]);

describe('Accept without a failing check', () => {
  it('is offered by name for one failing check, for all of them otherwise', () => {
    expect(ids(view({ state: 'held', waivable: ['test'] }))).toContainEqual(['waive', 'Accept without test…']);
    expect(ids(view({ state: 'rework', waivable: ['test', 'lint'] }))).toContainEqual([
      'waive',
      'Accept without failing checks…',
    ]);
  });

  it('is not offered once nothing failing holds the ticket', () => {
    expect(ids(view({ state: 'held' })).map(([id]) => id)).not.toContain('waive');
    expect(ids(view({ state: 'decided', waivable: ['test'] })).map(([id]) => id)).not.toContain('waive');
  });

  it('a waiver in force can be undone', () => {
    expect(ids(view({ state: 'decided', waived: ['test'] }))).toContainEqual(['undo-waiver', 'Run test again']);
  });
});
