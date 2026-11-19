import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { readAttentionPolicy } from '../src/attention/attentionStore';
import { writeReviewLimit } from '../src/attention/writeReviewLimit';
import { thisMachineOnly } from '../src/server/thisMachineRoutes';
import { tempFolder } from './tempFolder';

/* The team's review limit, as Settings → Attention writes it into attention.json. */
const tmpRoot = () => {
  const root = path.join(tempFolder('teamtrail-review-limit-'), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};
const file = (root: string) => path.join(root, 'attention.json');
const read = (root: string) => JSON.parse(readFileSync(file(root), 'utf8')) as Record<string, unknown>;

test('setting the limit creates attention.json, and off removes only the limit', () => {
  const root = tmpRoot();
  assert.deepEqual(writeReviewLimit(root, 5).errors, []);
  assert.deepEqual(read(root), { v: 1, reviewLimit: 5 });
  assert.equal(readAttentionPolicy(root).value.reviewLimit, 5);
  writeReviewLimit(root, null);
  assert.deepEqual(read(root), { v: 1 });
  assert.equal(readAttentionPolicy(root).value.reviewLimit, undefined);
});

test("keeps the team's other settings as written, even ones that don't parse", () => {
  const root = tmpRoot();
  writeFileSync(file(root), JSON.stringify({ v: 1, interrupt: 80, weights: { question: 90, nope: 1 } }));
  assert.deepEqual(writeReviewLimit(root, 8).errors, []);
  assert.deepEqual(read(root), { v: 1, interrupt: 80, weights: { question: 90, nope: 1 }, reviewLimit: 8 });
});

test('refuses a value out of range, and never overwrites a file that is not JSON', () => {
  const root = tmpRoot();
  assert.match(writeReviewLimit(root, 0).errors[0], /"reviewLimit" must be a whole number from 1 to 50/);
  assert.equal(existsSync(file(root)), false);
  writeFileSync(file(root), '{ "v": 1, ');
  assert.match(writeReviewLimit(root, 5).errors[0], /fix it by hand/);
  assert.equal(readFileSync(file(root), 'utf8'), '{ "v": 1, ');
});

test('only the machine Teamtrail runs on sets the limit', () => {
  assert.equal(thisMachineOnly('PUT', '/attention/review-limit'), true);
  assert.equal(thisMachineOnly('GET', '/attention'), false);
});
