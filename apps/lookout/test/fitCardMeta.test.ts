import { describe, expect, it } from 'vitest';
import { fitCardMeta } from '../src/features/map/fitCardMeta';

describe('fitCardMeta', () => {
  it('leaves a short line alone', () => {
    expect(fitCardMeta({ parts: ['#8', 'Task', 'ready'], guide: 'QA' })).toEqual({ guideText: 'QA', squeeze: {} });
  });

  it('keeps a guide name recognisable on a crowded line, and squeezes the line to the card', () => {
    const fit = fitCardMeta({ parts: ['#1', 'Task', 'claude-01 · step 2/4'], guide: 'Accessibility' });
    expect(fit.guideText).toMatch(/^Access.*…$/);
    expect(fit.squeeze).toHaveProperty('lengthAdjust', 'spacingAndGlyphs');
  });
});
