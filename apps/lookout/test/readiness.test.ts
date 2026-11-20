import type { AttentionItem, ReadinessFinding, ReadinessTrail, RepoReadiness } from '@teamtrail/core';
import { describe, expect, it, vi } from 'vitest';
import { openItem, type AttentionHandlers } from '../src/features/attention/openItem';
import { placeLabel } from '../src/features/hands-off/placeLabel';
import {
  findingContext,
  findingEdge,
  fixLabel,
  fixLines,
  summaryParts,
  trailLine,
  unitNeeds,
  unknownPrograms,
} from '../src/features/readiness/readinessText';
import { SETTINGS_GROUPS } from '../src/features/settings/settingsGroups';

const now = Date.UTC(2026, 10, 20, 12);
const finding = (over: Partial<ReadinessFinding>): ReadinessFinding => ({
  id: 'checks-none',
  kind: 'checks',
  level: 'blocks',
  text: "Teamtrail can't verify work yet: no checks",
  why: 'verification.json names no check that runs',
  ...over,
});

describe('repo readiness in the Lookout', () => {
  it('red only for what holds work now; amber for a check that may fail', () => {
    expect(findingEdge(finding({}))).toBe('urgent');
    expect(findingEdge(finding({ level: 'warns' }))).toBe('attention');
    expect(findingEdge(finding({ level: 'info' }))).toBe('neutral');
    const parts = findingContext(finding({ level: 'warns', unit: 'apps/web', checks: ['web-test'] }));
    expect(parts).toEqual(['A check may fail', { text: 'apps/web', code: true }, 'check web-test']);
  });

  it('a fix says what it writes, exactly, and asks for the person’s word on a program Teamtrail doesn’t know', () => {
    const add = {
      kind: 'add-checks' as const,
      checks: [
        { name: 'test', run: ['npm', 'test'], cwd: '', known: true },
        { name: 'e2e', run: ['just', 'e2e'], cwd: 'apps/web', known: false },
      ],
    };
    expect(fixLabel(add)).toBe('Use 2 suggested checks');
    expect(fixLines(add)).toEqual([
      { name: 'test', run: 'npm test', cwd: 'the top' },
      { name: 'e2e', run: 'just e2e', cwd: 'apps/web' },
    ]);
    expect(unknownPrograms(add)).toEqual(['just']);
    expect(fixLabel({ kind: 'set-folder', check: 'test', cwd: 'apps/web' })).toBe('Run test in apps/web');
    const setup = { kind: 'add-setup' as const, name: 'web', run: ['npm', 'ci'], cwd: 'apps/web' };
    expect(fixLabel(setup)).toBe('Add the setup step web');
    expect(unknownPrograms(setup)).toEqual([]);
  });

  it('says where each trail stands: held, or started anyway with when', () => {
    const t: ReadinessTrail = { mapId: 'm', title: 'Sync', held: 2, waits: true };
    expect(trailLine(t, now)).toBe('2 ready tickets held back');
    expect(trailLine({ ...t, held: 0 }, now)).toMatch(/waits; research and reviews go on/);
    expect(trailLine({ ...t, held: 0, waits: false }, now)).toBe("Nothing waits: its work isn't verified with checks");
    const started = {
      ...t,
      waits: false,
      startedAnyway: { at: now - 5 * 60_000, by: 'Ada', findings: ['checks-none'] },
    };
    expect(trailLine(started, now)).toBe('You started it anyway 5 min ago: new work goes on');
  });

  it('summarises the repo and each folder’s needs in one line', () => {
    const r = {
      layout: 'workspace',
      units: [{}, {}],
      tools: ['npm'],
      ci: ['.github/workflows/ci.yml'],
      probed: 'skipped',
    } as unknown as RepoReadiness;
    expect(summaryParts(r)).toEqual([
      'Monorepo',
      '2 folders',
      'npm',
      { text: '.github/workflows/ci.yml', code: true },
      'this machine not probed: checks run elsewhere',
    ]);
    const unit = {
      needs: [
        { kind: 'unit', label: 'checked by test', ok: true },
        { kind: 'install', label: 'dependencies installed', ok: false, finding: 'install:' },
      ],
    } as Parameters<typeof unitNeeds>[0];
    expect(unitNeeds(unit)).toBe('✓ checked by test · ✗ dependencies installed');
  });

  it('its queue item opens Settings → Project → Repo readiness', () => {
    const openReadiness = vi.fn();
    const item = { kind: 'readiness', mapId: '', ref: 'readiness' } as AttentionItem;
    openItem(item, { openReadiness } as unknown as AttentionHandlers);
    expect(openReadiness).toHaveBeenCalled();
    expect(placeLabel(item)).toBe('Open Repo readiness');
    const project = SETTINGS_GROUPS.find((g) => g.id === 'project');
    expect(project?.sections.map((s) => s.id)).toContain('readiness');
  });
});
