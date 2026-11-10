import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from '../src/mcp/instructions';

const scout = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../commands/scout.md'), 'utf8');

// Agent guidance shapes what every agent does. Edits must be deliberate: update the snapshot with `vitest -u`.
describe('agent guidance', () => {
  it('server instructions', () => {
    expect(INSTRUCTIONS).toMatchSnapshot();
  });
  it('/scout command', () => {
    expect(scout).toMatchSnapshot();
  });
  it('keeps the rules that matter', () => {
    for (const text of [INSTRUCTIONS, scout]) {
      expect(text).toMatch(/don't chart|without a trail/);
      expect(text).toContain('record_decision');
      expect(text).toContain('submit_brief');
      expect(text).toContain('propose_knowledge');
      expect(text).toContain('flag_knowledge');
      expect(text).toContain('set_criteria');
      expect(text).toMatch(/Never decide (HITL|a `hitl`)/);
      expect(text).toMatch(/get past a gate doesn't work/);
    }
  });
});
