import type { ReadinessFinding, ReadinessView } from '@teamtrail/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fullTicketHref } from '../src/app/useFullTicketRoute';
import { checksMissing } from '../src/features/trail/checksMissing';
import { settingsSectionLink } from '../src/lib/settingsSectionLink';

const finding = (over: Partial<ReadinessFinding>): ReadinessFinding => ({
  id: 'checks-none',
  kind: 'checks',
  level: 'blocks',
  text: "Teamtrail can't verify work yet: no checks",
  why: 'verification.json names no check that runs',
  ...over,
});

const view = (findings: ReadinessFinding[], read = true) =>
  ({ readiness: { read, findings, blocking: findings.length }, trails: [] }) as unknown as ReadinessView;

describe('Start the trail says when no checks are set', () => {
  it('while readiness finds no approved checks: none in the file, or none approved here', () => {
    expect(checksMissing(view([finding({})]))).toBe(true);
    expect(checksMissing(view([finding({ id: 'checks-unapproved' })]))).toBe(true);
  });

  it('never on a guess: before readiness loads, or when it could not read the repo', () => {
    expect(checksMissing(undefined)).toBe(false);
    expect(checksMissing(view([finding({})], false))).toBe(false);
  });

  it('not once checks are approved, whatever else readiness finds', () => {
    expect(checksMissing(view([]))).toBe(false);
    expect(checksMissing(view([finding({ id: 'program:go', kind: 'program' }), finding({ kind: 'unit' })]))).toBe(
      false,
    );
  });
});

describe('the full ticket in the URL', () => {
  const base = 'http://127.0.0.1:4100/?project=abc123&view=activity';

  it('adds and removes ?ticket=, keeping the rest', () => {
    expect(fullTicketHref(base, '12')).toBe('http://127.0.0.1:4100/?project=abc123&view=activity&ticket=12');
    expect(fullTicketHref(`${base}&ticket=12`, undefined)).toBe(base);
  });

  it('takes the place of the page it was opened from', () => {
    expect(fullTicketHref(base, '12', true)).toBe('http://127.0.0.1:4100/?project=abc123&ticket=12');
  });
});

describe('a link to a Settings section', () => {
  const calls: { kind: string; state: unknown; url: string }[] = [];
  const stub = (search: string) => {
    calls.length = 0;
    const url = `http://127.0.0.1:4100/${search}`;
    vi.stubGlobal('location', { href: url, search });
    vi.stubGlobal('history', {
      state: { lookoutPage: true },
      pushState: (state: unknown, _: string, u: string) => calls.push({ kind: 'push', state, url: u }),
      replaceState: (state: unknown, _: string, u: string) => calls.push({ kind: 'replace', state, url: u }),
    });
    vi.stubGlobal('PopStateEvent', class extends Event {});
    vi.stubGlobal('window', { dispatchEvent: () => calls.push({ kind: 'popstate', state: null, url: '' }) });
  };
  afterEach(() => vi.unstubAllGlobals());

  it('from the Lookout, pushes an entry marked as Settings, so Back and closing Settings return', () => {
    stub('?view=plan');
    const link = settingsSectionLink('verification');
    expect(link.href).toBe('http://127.0.0.1:4100/?view=plan&settings=verification');
    link.onClick({ preventDefault: () => undefined });
    expect(calls).toEqual([
      { kind: 'push', state: { settingsPage: true }, url: link.href },
      { kind: 'popstate', state: null, url: '' },
    ]);
  });

  it('inside Settings, replaces the entry, as moving between sections does', () => {
    stub('?settings=approvals');
    settingsSectionLink('verification').onClick({ preventDefault: () => undefined });
    expect(calls[0]).toEqual({
      kind: 'replace',
      state: { lookoutPage: true },
      url: 'http://127.0.0.1:4100/?settings=verification',
    });
  });
});
