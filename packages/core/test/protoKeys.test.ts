import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { parseYamlSubset } from '../src/guides/guideYaml';
import { readJsonFile } from '../src/lib/jsonFile';
import { parseFront } from '../src/model/frontmatter';
import { parseJsonSafe } from '../src/model/safeKey';
import { parsePolicy } from '../src/policy/policyFile';
import { parseWorkspaceSettings } from '../src/workspaces/workspaceFile';

// A key named __proto__ in a committed file used to replace the prototype of the object the parser built, so
// every other key on it read through an object the file chose (`front.verification` included).
test('frontmatter: a __proto__ key is skipped, not made the prototype', () => {
  const { front } = parseFront('---\n__proto__: x\nconstructor: y\ntitle: T\n---\nbody');
  expect(Object.getPrototypeOf(front)).toBe(Object.prototype);
  expect(Object.keys(front)).toEqual(['title']);
  expect(Object.hasOwn(front, 'constructor')).toBe(false);
});

test('guide YAML: a __proto__ key is an error, and the map keeps its prototype', () => {
  const r = parseYamlSubset('id: qa\n__proto__:\n  verification: off\n');
  expect(r.errors.map((e) => e.message).join()).toMatch(/"__proto__" is not a key/);
  if (r.value) expect(Object.getPrototypeOf(r.value)).toBe(Object.prototype);
});

test('JSON config files: no __proto__, constructor or prototype key survives, at any depth', () => {
  const text = '{"v":1,"__proto__":{"polluted":true},"a":{"constructor":{"prototype":{"x":1}},"b":2}}';
  const v = parseJsonSafe(text) as Record<string, Record<string, unknown>>;
  expect(Object.hasOwn(v, '__proto__')).toBe(false);
  expect(v.a).toEqual({ b: 2 });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-proto-')), 'x.json');
  fs.writeFileSync(file, text);
  const read = readJsonFile<Record<string, unknown>>(file)!;
  const copy: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(read)) copy[k] = val;
  expect((copy as { polluted?: boolean }).polluted).toBeUndefined();
  expect(parsePolicy('{"v":1,"__proto__":{"x":1},"categories":{}}').errors).toEqual([]);
  expect(parseWorkspaceSettings('{"v":1,"__proto__":{"worktrees":true}}').settings?.worktrees).toBe(false);
});
