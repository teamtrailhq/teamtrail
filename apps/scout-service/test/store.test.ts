/**
 * The store contract, for both stores. Postgres runs only when SCOUT_TEST_DATABASE_URL names a database the
 * tests may fill and empty (tables are prefixed `scout_`); otherwise it is skipped.
 */
import { afterAll, describe, expect, test } from 'vitest';
import { MemoryStore } from '../src/store/MemoryStore';
import { PostgresStore } from '../src/store/PostgresStore';
import type { ServiceStore } from '../src/types';

const pgUrl = process.env.SCOUT_TEST_DATABASE_URL;
const opened: ServiceStore[] = [];
afterAll(async () => {
  for (const s of opened) await s.close();
});

const workspace = (teamId: string) => ({
  teamId,
  teamName: 'Team',
  botUserId: 'B1',
  botToken: 'v1:sealed',
  scopes: ['chat:write'],
  installedBy: 'U1',
  installedAt: 1,
});

function contract(name: string, make: () => Promise<ServiceStore>) {
  describe(name, () => {
    test('workspaces and links, removed together', async () => {
      const s = await make();
      const team = `T${Math.random().toString(36).slice(2)}`;
      await s.saveWorkspace(workspace(team));
      await s.saveWorkspace({ ...workspace(team), teamName: 'Renamed' });
      expect((await s.workspace(team))?.teamName).toBe('Renamed');
      await s.saveLink({ id: `${team}-a`, teamId: team, userId: 'U1', tokenHash: `${team}-h1`, createdAt: 2 });
      await s.saveLink({ id: `${team}-b`, teamId: team, userId: 'U1', tokenHash: `${team}-h2`, createdAt: 1 });
      expect((await s.linksOf(team, 'U1')).map((l) => l.id)).toEqual([`${team}-b`, `${team}-a`]);
      expect((await s.linkByTokenHash(`${team}-h1`))?.id).toBe(`${team}-a`);
      await s.touchLink(`${team}-a`, 9);
      expect((await s.link(`${team}-a`))?.lastSeenAt).toBe(9);
      expect((await s.removeWorkspace(team)).sort()).toEqual([`${team}-a`, `${team}-b`]);
      expect(await s.link(`${team}-a`)).toBeUndefined();
    });

    test('installs and codes are single use and expire', async () => {
      const s = await make();
      const key = Math.random().toString(36);
      await s.saveInstall({ stateHash: key, challenge: 'c', returnUrl: 'r', expiresAt: 100 });
      expect(await s.takeInstall(key, 200)).toBeUndefined();
      await s.saveInstall({ stateHash: key, challenge: 'c', returnUrl: 'r', expiresAt: 100 });
      expect((await s.takeInstall(key, 50))?.challenge).toBe('c');
      expect(await s.takeInstall(key, 50)).toBeUndefined();
      await s.saveCode({ codeHash: key, challenge: 'c', teamId: 'T', userId: 'U', expiresAt: 100 });
      expect((await s.takeCode(key, 50))?.userId).toBe('U');
      expect(await s.takeCode(key, 50)).toBeUndefined();
      await s.saveCode({ codeHash: `${key}x`, challenge: 'c', teamId: 'T', userId: 'U', expiresAt: 100 });
      await s.purge(200);
      expect(await s.takeCode(`${key}x`, 50)).toBeUndefined();
    });
  });
}

contract('MemoryStore', async () => new MemoryStore());

if (pgUrl) {
  let shared: Promise<PostgresStore> | undefined;
  contract('PostgresStore', () => {
    shared ??= PostgresStore.open(pgUrl).then((s) => (opened.push(s), s));
    return shared;
  });
} else {
  test.skip('PostgresStore (set SCOUT_TEST_DATABASE_URL to run)', () => {});
}
