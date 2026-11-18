import { TRAIL_TEXT_LIMITS } from '@teamtrail/core';
import { describe, expect, test } from 'vitest';
import { assumptionLines } from '../src/lib/assumptionLines';
import { summaryLine } from '../src/lib/markdown';
import { readTextFile } from '../src/lib/readTextFile';

describe("a destination's one line", () => {
  test('is its first sentence, markdown stripped', () => {
    expect(summaryLine('Sync works **offline**. Then conflicts merge.\n\nMore here.')).toBe('Sync works offline.');
    expect(summaryLine('# Offline sync\n\nEvery edit survives a dropped connection.')).toBe('Offline sync');
    expect(summaryLine('- Ship [the v2 API](https://example.com) to `beta` users\n- then GA')).toBe(
      'Ship the v2 API to beta users',
    );
  });

  test('skips code and rules, reads on past "e.g." and version numbers, and never spans lines', () => {
    expect(summaryLine('```\n## not this\n```\n\n---\n\n> Users on v2.1 keep e.g. drafts\n> across devices.')).toBe(
      'Users on v2.1 keep e.g. drafts across devices.',
    );
    expect(summaryLine('')).toBe('');
  });

  test('is cut at a word with an ellipsis when the sentence is long', () => {
    const line = summaryLine(`${'word '.repeat(80)}end.`, 60);
    expect(line.length).toBeLessThanOrEqual(60);
    expect(line.endsWith('…')).toBe(true);
    expect(line).not.toMatch(/\n/);
  });
});

describe('the assumptions field', () => {
  test('one per non-empty line, a pasted list without its bullets', () => {
    expect(
      assumptionLines('- The API takes batches\n\n* Users stay on one device\n1. Two\n3) Three\n- [x] Done'),
    ).toEqual(['The API takes batches', 'Users stay on one device', 'Two', 'Three', 'Done']);
    expect(assumptionLines('  \r\n plain line \r\n')).toEqual(['plain line']);
  });
});

describe('Load from file', () => {
  const file = (text: string, name: string) => new File([text], name, { type: 'text/plain' });

  test('reads a markdown or text file as it is', async () => {
    const text = '---\ntitle: x\n---\n\n## Notes\n\nKept as written.';
    expect(await readTextFile(file(text, 'spec.md'), 1000)).toEqual({ kind: 'text', name: 'spec.md', text });
    expect((await readTextFile(file('a', 'NOTES.TXT'), 10)).kind).toBe('text');
    expect((await readTextFile(file('a', 'notes.markdown'), 10)).kind).toBe('text');
  });

  test('refuses other kinds, binary files and text past the limit, saying why', async () => {
    expect(await readTextFile(file('a', 'spec.pdf'), 10)).toMatchObject({
      kind: 'refused',
      reason: expect.stringMatching(/spec.pdf isn't a markdown or text file/),
    });
    expect(await readTextFile(file('a\u0000b', 'x.md'), 10)).toMatchObject({ reason: "x.md isn't text." });
    const notes = TRAIL_TEXT_LIMITS.notes;
    expect(await readTextFile(file('n'.repeat(notes + 1), 'long.md'), notes)).toMatchObject({
      kind: 'refused',
      reason: 'long.md is too long (50,001 characters): this field takes at most 50,000 characters.',
    });
  });
});
