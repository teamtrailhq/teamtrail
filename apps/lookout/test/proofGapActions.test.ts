import type { GapStanding } from '@teamtrail/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MenuItem } from '../src/components/ui';
import { gapActionList } from '../src/features/inspector/gapActionList';
import { ProofGapList } from '../src/features/proof/ProofGapList';

const noop = () => {};
const run = { confirm: noop, verifyAgain: noop };
const gap = (over: Partial<GapStanding>): GapStanding => ({
  kind: 'criteria-unconfirmed',
  text: "The trail lead hadn't confirmed the criteria.",
  owner: 'you',
  status: 'Needs you: confirm the criteria, then it is verified again on the same commit.',
  action: 'confirm-and-verify',
  ...over,
});

describe('what closes a proof gap in the Lookout', () => {
  it('a done ticket with unconfirmed criteria offers Confirm criteria and verify again', () => {
    const items = gapActionList([gap({})], [], run);
    expect([...items.values()].map((i) => i.label)).toEqual(['Confirm criteria and verify again']);
  });

  it('uses the ticket’s own action when its menu has one, each once', () => {
    const approve: MenuItem = { id: 'approve', label: 'Approve', onSelect: noop };
    const plan = [
      gap({ kind: 'trail-lead-not-approved', text: 'a', action: 'approve' }),
      gap({ kind: 'review-not-pass', text: 'b', action: 'approve' }),
    ];
    const items = gapActionList(plan, [approve], run);
    expect([...items.values()]).toEqual([approve]);
  });

  it('offers nothing for gaps no action closes, or for checks on main the queue doesn’t hold', () => {
    const plan = [
      gap({ kind: 'verification-off', owner: 'nobody', action: undefined }),
      gap({ kind: 'known-failures', owner: 'main', action: 'open-main-checks' }),
    ];
    expect(gapActionList(plan, [], run).size).toBe(0);
    expect(gapActionList(plan, [], { ...run, openMain: noop }).get('open-main-checks')?.label).toBe(
      'Open checks on main',
    );
  });

  it('lists each gap with who is on it, and a button only where the action is the human’s', () => {
    const plan = [
      gap({}),
      gap({
        kind: 'no-independent-review',
        text: 'No independent review passed it.',
        owner: 'agent',
        status: 'Waiting for an agent to review it.',
        action: undefined,
      }),
    ];
    const actions = gapActionList(plan, [], run);
    const html = renderToStaticMarkup(createElement(ProofGapList, { gaps: plan.map((g) => g.text), plan, actions }));
    expect(html).toContain('Waiting for an agent to review it.');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('Confirm criteria and verify again');
  });
});
