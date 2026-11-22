import type { TrustItem } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { shownWhole, standingText } from '../src/features/approvals/approvalCopy';
import { changeParts } from '../src/features/approvals/changeParts';

const config = (run: string[]) => JSON.stringify({ v: 1, checks: { test: { run } }, run: ['test'] });

function item(over: Partial<TrustItem>): TrustItem {
  return {
    key: 'checks',
    kind: 'checks',
    hash: 'sha256:x',
    content: config(['python3', '-m', 'pytest']),
    standing: 'elsewhere',
    title: 'Check commands in verification.json',
    lines: [],
    warnings: [],
    ...over,
  } as TrustItem;
}

describe('an approval item for check commands nobody committed', () => {
  it('shows the commands as their diff, never the raw file', () => {
    // as core's checksDiff writes them (packages/core/test/trust.node.test.ts)
    const lines = ['+ test: python3 -m pytest'];
    const waiting = item({ committed: false, lines });
    expect(shownWhole(waiting)).toBe(false);
    expect(waiting.lines).toEqual(['+ test: python3 -m pytest']);
    expect(standingText(waiting)).toBe('Never approved on this machine');
  });

  it('says a change since the approval, old value struck through before the new one', () => {
    const lines = ['test: python -m pytest → python3 -m pytest'];
    expect(standingText(item({ committed: false, standing: 'changed', lines }))).toBe(
      'Changed since you approved it here',
    );
    expect(changeParts(lines[0]!)).toEqual({ head: 'test: ', was: 'python -m pytest', now: 'python3 -m pytest' });
  });

  it('still shows free text nobody committed whole', () => {
    const brief = item({ kind: 'brief', key: 'brief:x', committed: false });
    expect(shownWhole(brief)).toBe(true);
    expect(standingText(brief)).toBe('Not committed, so shown whole');
  });
});
