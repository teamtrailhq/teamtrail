import { describe, expect, it } from 'vitest';
import { criteriaProposalEvent } from '../src/server/criteriaProposalEvent';

describe('a change to proposed criteria reaches the Lookout', () => {
  it('names the trail, and ignores temp files and everything else', () => {
    expect(criteriaProposalEvent('.agents/criteria-proposals/m1.json')).toBe(
      'event: criteria-proposals\ndata: {"mapId":"m1"}\n\n',
    );
    expect(criteriaProposalEvent('.agents/criteria-proposals/m1.json.123.tmp')).toBeUndefined();
    expect(criteriaProposalEvent('.agents/sessions/s1.json')).toBeUndefined();
  });
});
