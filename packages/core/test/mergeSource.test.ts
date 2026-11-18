import { describe, expect, it } from 'vitest';
import { mergeSource } from '../src/attention/sources/mergeSource';
import type { AttentionInput } from '../src/attention/types';
import type { ChecksSummary, PullRequestSnapshot } from '../src/model/prEvidence';

const snaps = [{ map: { id: 'm' }, tickets: [{ id: '1', key: '#1', state: 'closed', closeReason: 'completed' }] }];

/** The merge item's title for a done ticket's open PR in this state. */
function title(pr: Partial<PullRequestSnapshot>, checksSummary: ChecksSummary = 'passed') {
  const open = { number: 2, state: 'open', draft: false, review: 'none', mergeable: 'clean', ...pr };
  const sync = { mapId: 'm', ticketId: '1', ticketKey: '#1', flags: [], pr: open, checksSummary };
  const input = { snaps, syncs: [sync], now: 10 } as unknown as AttentionInput;
  return mergeSource.collect(input)[0]?.title;
}

describe('mergeSource', () => {
  it('says "ready to merge" only when nothing stands in the way', () => {
    expect(title({})).toBe('#1: PR #2 ready to merge');
    expect(title({ draft: true })).toBe('#1: PR #2 is still a draft');
    expect(title({ mergeable: 'conflicting' })).toBe('#1: PR #2 has merge conflicts');
    expect(title({ review: 'changes_requested' })).toBe('#1: PR #2: changes requested');
    expect(title({}, 'failing')).toBe('#1: PR #2: checks failing');
    expect(title({}, 'pending')).toBe('#1: PR #2: checks still running');
    expect(title({ review: 'approved', mergeable: 'unknown' }, 'none')).toBe('#1: PR #2 ready to merge');
  });
});
