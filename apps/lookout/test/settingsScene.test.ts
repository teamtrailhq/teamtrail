import { describe, expect, it } from 'vitest';
import { diffLine } from '../src/features/approvals/diffLine';
import { savedParts } from '../src/features/settings/savedParts';
import { sectionHeadline } from '../src/features/settings/sectionHeadline';
import { SETTINGS_GROUPS } from '../src/features/settings/settingsGroups';

describe('approval diff lines', () => {
  it('reads added, removed, changed and context lines', () => {
    expect(diffLine('+ lint: npm run lint')).toEqual({ kind: 'add', gutter: '+', text: 'lint: npm run lint' });
    expect(diffLine('- lint: npm run lint')).toEqual({ kind: 'rm', gutter: '−', text: 'lint: npm run lint' });
    expect(diffLine('state: open → closed')).toEqual({ kind: 'change', gutter: '~', text: 'state: open → closed' });
    expect(diffLine('tests: npm test')).toEqual({ kind: 'same', gutter: '', text: 'tests: npm test' });
  });
  it('needs the space after the sign, so a flag is context', () => {
    expect(diffLine('--max-warnings 0').kind).toBe('same');
    expect(diffLine('+x').kind).toBe('same');
  });
});

describe('the saved note', () => {
  const at = new Date(2026, 10, 21, 9, 5).getTime();
  it('says journaled only where the route journals', () => {
    expect(savedParts({ at, journaled: true })).toEqual(['Saved', 'journaled', '09:05']);
    expect(savedParts({ at, journaled: false })).toEqual(['Saved', '09:05']);
  });
});

describe('section headlines', () => {
  it('give every section what it decides', () => {
    for (const g of SETTINGS_GROUPS) {
      expect(g.blurb.length).toBeGreaterThan(0);
      for (const s of g.sections) expect(sectionHeadline(s.id)).toBe(s.decides);
    }
  });
});
