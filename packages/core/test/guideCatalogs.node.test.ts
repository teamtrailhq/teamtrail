import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { findCatalogGuide, parseGuideRef } from '../src/guides/findCatalogGuide';
import { lintGuide } from '../src/guides/guideLint';
import { DEFAULT_REGISTRY, readGuidesConfig } from '../src/guides/guidesConfig';
import { guideFilePath, listGuides } from '../src/guides/guideStore';
import { approveGuide } from '../src/guides/installGuide';
import { guideTemplate, newGuide } from '../src/guides/newGuide';
import { fakeGuideCatalog, guideText } from './fakes/guideCatalog';

const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-catalogs-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const config = (root: string, value: unknown) => {
  writeFileSync(path.join(root, 'guides.json'), JSON.stringify(value));
  return readGuidesConfig(root);
};
const ours = { name: 'ours', url: 'https://guides.example.com' };

test('guides.json adds catalogs before the official one, unless it opts out or lists it itself', () => {
  const root = tmpRoot();
  assert.deepEqual(readGuidesConfig(root).config.registries, [DEFAULT_REGISTRY]);
  assert.deepEqual(config(root, { v: 1, registries: [ours] }).config.registries, [ours, DEFAULT_REGISTRY]);
  assert.deepEqual(config(root, { v: 1, registries: [ours], official: false }).config.registries, [ours]);
  assert.deepEqual(config(root, { v: 1, official: false }).config.registries, []);
  // listing the official catalog places it; it isn't added twice
  const placed = config(root, { v: 1, registries: [DEFAULT_REGISTRY, ours] });
  assert.deepEqual(placed.config.registries, [DEFAULT_REGISTRY, ours]);
  const bad = config(root, { v: 1, registries: [ours, { name: 'x', url: 'http://evil.example' }], official: 'no' });
  assert.deepEqual(bad.config.registries, [ours, DEFAULT_REGISTRY]);
  assert.equal(bad.errors.length, 2);
  assert.match(bad.errors[1], /"official" must be true or false/);
});

test('a guide ref names its catalog with catalog/id', () => {
  assert.deepEqual(parseGuideRef('a11y'), { id: 'a11y' });
  assert.deepEqual(parseGuideRef('ours/a11y'), { catalog: 'ours', id: 'a11y' });
});

test('findCatalogGuide searches every catalog in order, refuses an ambiguous id and takes catalog/id', async () => {
  const first = await fakeGuideCatalog({ a11y: guideText({ id: 'a11y' }) });
  const second = await fakeGuideCatalog({
    a11y: guideText({ id: 'a11y', version: '2.0.0' }),
    perf: guideText({ id: 'perf' }),
  });
  const down = { name: 'down', url: 'http://127.0.0.1:9' };
  const registries = [
    { name: 'first', url: first.url },
    { name: 'second', url: second.url },
  ];
  try {
    const perf = await findCatalogGuide({ registries, ref: 'perf' });
    assert.equal(perf.registry.name, 'second');
    assert.equal(perf.entry.id, 'perf');
    await assert.rejects(
      findCatalogGuide({ registries, ref: 'a11y' }),
      /more than one catalog.*first\/a11y or second\/a11y/,
    );
    assert.equal((await findCatalogGuide({ registries, ref: 'second/a11y' })).entry.version, '2.0.0');
    assert.equal((await findCatalogGuide({ registries, ref: 'a11y', only: 'first' })).registry.name, 'first');
    await assert.rejects(findCatalogGuide({ registries, ref: 'third/a11y' }), /no catalog named "third"/);
    await assert.rejects(
      findCatalogGuide({ registries, ref: 'nope' }),
      /no catalog has a guide "nope" \(searched first, second\)/,
    );
    // a catalog that can't be read doesn't stop the search, and is reported
    const found = await findCatalogGuide({ registries: [down, ...registries], ref: 'perf', timeoutMs: 2000 });
    assert.equal(found.registry.name, 'second');
    assert.equal(found.unreachable.length, 1);
    assert.match(found.unreachable[0], /^down /);
  } finally {
    await first.close();
    await second.close();
  }
});

test('a built-in guide is never found to add, even when a catalog lists its copy', async () => {
  const cat = await fakeGuideCatalog({ qa: guideText({ id: 'qa' }) });
  cat.index.guides[0] = { ...cat.index.guides[0], builtin: true } as (typeof cat.index.guides)[0];
  try {
    await assert.rejects(findCatalogGuide({ registries: [{ name: 'c', url: cat.url }], ref: 'qa' }), /built into/);
  } finally {
    await cat.close();
  }
});

test('guides new writes a template that passes the lint; it waits for the trail lead, then agents can use it', () => {
  const root = tmpRoot();
  assert.equal(lintGuide(guideTemplate({ id: 'api-design', author: 'Ada: "Lovelace"' })).ok, true);
  const { file, lint } = newGuide({ root, id: 'api-design', author: 'Ada Lovelace' });
  assert.equal(file, guideFilePath(root, 'api-design'));
  assert.equal(lint.ok, true);
  assert.match(readFileSync(file, 'utf8'), /name: Api design\n[\s\S]*author: Ada Lovelace/);
  const before = listGuides(root).find((r) => r.id === 'api-design')!;
  assert.equal(before.status, 'unapproved');
  approveGuide({ root, id: 'api-design', by: 'trail lead' });
  const after = listGuides(root).find((r) => r.id === 'api-design')!;
  assert.equal(after.status, 'active');
  assert.equal(after.lock?.source, 'local');
  assert.throws(() => newGuide({ root, id: 'api-design', author: 'x' }), /already exists/);
  assert.throws(() => newGuide({ root, id: 'reviewer', author: 'x' }), /built-in guide/);
  assert.throws(() => newGuide({ root, id: 'Bad_Id', author: 'x' }), /kebab-case/);
});
