import { expect, test } from 'vitest';
import { globsOverlap, touchOverlaps, type TicketLease } from '../src';
import { globMatch } from '../src/knowledge/knowledge';
import { modelIdMatch } from '../src/planning/matching/modelIdMatch';

const timed = (fn: () => unknown) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

// The audit's pattern: 37 characters that took 95 seconds against 40 a's with the regex matcher.
test('glob matching takes time linear in the glob and the path, whatever the glob', () => {
  const evil = '**a'.repeat(12) + '!';
  expect(timed(() => expect(globMatch(evil, 'a'.repeat(40))).toBe(false))).toBeLessThan(50);
  expect(timed(() => globMatch('*a'.repeat(150), 'a'.repeat(300) + '!'))).toBeLessThan(50);
  expect(timed(() => globMatch('**/'.repeat(100) + 'x', 'a/'.repeat(150)))).toBeLessThan(50);
  expect(timed(() => modelIdMatch('*a'.repeat(30) + '!', 'a'.repeat(200)))).toBeLessThan(50);
  // Two sessions' worth of touches at the limits: 50 globs of 300 characters each, against each other.
  const touches = Array.from({ length: 50 }, (_, i) => `${'**a'.repeat(99)}${i}`);
  const lease = {
    mapId: 'm',
    ticketId: '2',
    ticketKey: '#2',
    agent: 'b',
    touches,
    expiresAt: Date.now() + 60_000,
    renewedAt: Date.now(),
    ttlMs: 60_000,
  } as unknown as TicketLease;
  expect(
    timed(() =>
      touchOverlaps({ mapId: 'm', ticketId: '1', touches: touches.map((t) => t.replace(/\*/g, 'a')) }, [lease]),
    ),
  ).toBeLessThan(2_000);
});

test('the same answers as before', () => {
  const cases: [string, string, boolean][] = [
    ['src/notify/**', 'src/notify/service.ts', true],
    ['src/notify/**', 'src/notifyx/a.ts', false],
    ['src/*.ts', 'src/a.ts', true],
    ['src/*.ts', 'src/x/a.ts', false],
    ['**/migrations/**', 'db/migrations/001.sql', true],
    ['**/migrations/**', 'migrations/001.sql', true],
    ['**/migrations/**', 'db/foomigrations/001.sql', false],
    ['src/**/*.ts', 'src/a.ts', true],
    ['src/**/*.ts', 'src/x/y/a.ts', true],
    ['**', 'anything/at/all', true],
    ['**/*.sql', 'a/b/c.sql', true],
    ['**/*.sql', 'c.sql', true],
    ['package.json', 'package.json', true],
    ['package.json', 'apackage.json', false],
    ['**/package.json', 'apps/x/package.json', true],
    ['**/package.json', 'xpackage.json', false],
    ['a/**/**/b', 'a/b', true],
    ['a/**/**/b', 'a/x/y/b', true],
    ['src/**', 'src', false],
    ['src/?.ts', 'src/a.ts', true],
    ['src/?.ts', 'src/ab.ts', false],
    ['*', 'a/b', false],
    ['a.b', 'axb', false],
    ['./src/a.ts', './src/a.ts', false],
  ];
  for (const [g, p, want] of cases) expect(globMatch(g, p), `${g} ~ ${p}`).toBe(want);
  expect(globMatch('src/a.ts', './src/a.ts')).toBe(true);
  expect(globsOverlap('src/**', 'src/app/*.ts')).toBe(true);
  expect(modelIdMatch('claude-*-haiku*', 'Claude-3-5-Haiku-latest')).toBe(true);
  expect(modelIdMatch('gpt-4*', 'gpt-4o-mini')).toBe(true);
  expect(modelIdMatch('gpt-4', 'gpt-4o')).toBe(false);
  expect(modelIdMatch('o?', 'o?')).toBe(true);
  expect(modelIdMatch('a.b', 'axb')).toBe(false);
});
