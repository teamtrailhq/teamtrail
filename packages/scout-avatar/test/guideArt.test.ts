import { expect, test } from 'vitest';
import { GUIDE_TONES, guideMarkup, type GuideRole } from '../src/scout/guideArt';

const ROLES: GuideRole[] = ['reviewer', 'qa', 'security', 'docs', 'architect', 'community'];

test('a guide icon is the symbol alone: no tile, no border, nothing behind it', () => {
  for (const role of ROLES) {
    const svg = guideMarkup(role, 'dark');
    expect(svg.startsWith('<g transform="translate(-30 -30) scale(1.3)">')).toBe(true);
    expect(svg).not.toContain('<rect');
    expect(svg).not.toContain('--tt-guide-bg');
  }
});

test('each theme draws in its ink with one accent, and Community has none', () => {
  expect(guideMarkup('qa', 'light')).toContain(GUIDE_TONES.light.accent);
  expect(guideMarkup('qa', 'dark')).toContain(GUIDE_TONES.dark.accent);
  expect(guideMarkup('community', 'dark')).not.toContain(GUIDE_TONES.dark.accent);
  expect(guideMarkup('reviewer')).toContain('var(--tt-guide-ink, #EDEDEF)');
});
