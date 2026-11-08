import { ROLE_LIMITS, type ProposedCheck, type RoleDoc, type RoleFinding } from '../model/role';
import { ALL_TICKET_TYPES, type TicketType } from '../model/types';
import { parseCheckSpec } from '../verification/config';
import type { YamlMap, YamlNode, YamlParse } from './roleYaml';

const KEYS = [
  'v',
  'id',
  'name',
  'version',
  'summary',
  'handles',
  'requiresChecks',
  'proposedChecks',
  'checklist',
  'preferredAgent',
  'author',
  'license',
  'homepage',
];
/** Keys a role might try to use to change what Teamtrail enforces. */
const FORBIDDEN = /^(verification|level|hitl|lifecycle|transitions?|tools|permissions|checks|run|status|approve)/i;
const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const CHECK_NAME_RE = /^[\w.-]+$/;

type Fields = Omit<RoleDoc, 'instructions'>;

/** Checks the frontmatter against the role schema; every problem names its line. */
export function roleFields(yaml: YamlParse): { fields?: Fields; findings: RoleFinding[] } {
  const findings: RoleFinding[] = [];
  const v = yaml.value;
  const lineOf = (path: string) => yaml.lines[path] ?? yaml.lines[path.split('.')[0]] ?? 1;
  const fail = (path: string, message: string) =>
    findings.push({ line: lineOf(path), rule: 'schema', level: 'error', message });
  for (const k of Object.keys(v)) {
    if (KEYS.includes(k)) continue;
    if (FORBIDDEN.test(k))
      fail(k, `a role can't set "${k}": verification, HITL, lifecycle and tools stay with Teamtrail and the trail lead`);
    else fail(k, `unknown key "${k}"`);
  }
  const text = (key: string, max: number, required = true) => {
    const s = v[key];
    if (s === undefined || s === '') return required ? void fail(key, `"${key}" is required`) : undefined;
    if (typeof s !== 'string') return void fail(key, `"${key}" must be text`);
    if (s.length > max) fail(key, `"${key}" is longer than ${max} characters`);
    return s;
  };
  if (v.v !== '1') fail('v', '"v" must be 1');
  const id = text('id', 40);
  if (id && !ID_RE.test(id)) fail('id', '"id" must be kebab-case (a-z, 0-9 and dashes)');
  const version = text('version', 40);
  if (version && !SEMVER_RE.test(version)) fail('version', '"version" must be semver, e.g. 1.0.0');
  const homepage = text('homepage', 300, false);
  if (homepage && !/^https:\/\//.test(homepage)) fail('homepage', '"homepage" must be an https URL');
  const fields: Fields = {
    v: 1,
    id: id ?? '',
    name: text('name', 60) ?? '',
    version: version ?? '',
    summary: text('summary', 200) ?? '',
    handles: handles(v.handles, fail),
    requiresChecks: checkNames(v.requiresChecks, fail),
    proposedChecks: proposed(v.proposedChecks, fail),
    checklist: checklist(v.checklist, fail),
    author: text('author', 100) ?? '',
    license: text('license', 60) ?? '',
    ...(text('preferredAgent', 60, false) ? { preferredAgent: v.preferredAgent as string } : {}),
    ...(homepage ? { homepage } : {}),
  };
  return findings.length ? { findings } : { fields, findings };
}

type Fail = (path: string, message: string) => void;

const isList = (n: YamlNode | undefined): n is string[] => Array.isArray(n);
const isMap = (n: YamlNode | undefined): n is YamlMap => !!n && typeof n === 'object' && !Array.isArray(n);

function handles(n: YamlNode | undefined, fail: Fail): RoleDoc['handles'] {
  if (!isMap(n)) return (fail('handles', '"handles" must list the ticket types the role is for'), { types: [], labels: [] });
  const unknown = Object.keys(n).filter((k) => k !== 'types' && k !== 'labels');
  if (unknown.length) fail('handles', `"handles" has unknown ${unknown.join(', ')}`);
  const types = isList(n.types) ? n.types : [];
  const bad = types.filter((t) => !(ALL_TICKET_TYPES as string[]).includes(t));
  if (!types.length || bad.length)
    fail('handles.types', `"handles.types" must list ticket types (${ALL_TICKET_TYPES.join(', ')})`);
  if (n.labels !== undefined && !isList(n.labels)) fail('handles.labels', '"handles.labels" must be a list');
  return { types: types as TicketType[], labels: isList(n.labels) ? n.labels : [] };
}

function checkNames(n: YamlNode | undefined, fail: Fail): string[] {
  if (n === undefined || n === '') return [];
  if (!isList(n) || !n.every((c) => CHECK_NAME_RE.test(c)))
    return (fail('requiresChecks', '"requiresChecks" must list check names'), []);
  return n;
}

function proposed(n: YamlNode | undefined, fail: Fail): Record<string, ProposedCheck> {
  if (n === undefined || n === '') return {};
  if (!isMap(n)) return (fail('proposedChecks', '"proposedChecks" must map check names to { run }'), {});
  const out: Record<string, ProposedCheck> = {};
  for (const [name, spec] of Object.entries(n)) {
    const errors: string[] = [];
    if (!CHECK_NAME_RE.test(name)) errors.push(`check name "${name}" may only use letters, digits, ".", "_" and "-"`);
    const raw = isMap(spec) ? { ...spec, ...timeout(spec.timeoutSec) } : spec;
    const parsed = parseCheckSpec(name, raw, errors);
    for (const e of errors) fail(`proposedChecks.${name}`, `proposedChecks: ${e}`);
    if (!parsed || errors.length) continue;
    const ownTimeout = isMap(spec) && !!spec.timeoutSec;
    out[name] = {
      run: parsed.run,
      ...(ownTimeout ? { timeoutSec: parsed.timeoutSec } : {}),
      ...(parsed.cwd ? { cwd: parsed.cwd } : {}),
    };
  }
  return out;
}

const timeout = (v: YamlNode | undefined) => (typeof v === 'string' && v ? { timeoutSec: Number(v) } : {});

function checklist(n: YamlNode | undefined, fail: Fail): string[] {
  if (n === undefined || n === '') return [];
  if (!isList(n)) return (fail('checklist', '"checklist" must be a list of items'), []);
  if (n.length > ROLE_LIMITS.checklistItems)
    fail('checklist', `"checklist" has ${n.length} items; at most ${ROLE_LIMITS.checklistItems}`);
  for (const item of n) {
    if (!item.trim()) fail('checklist', 'a checklist item is empty');
    if (item.length > ROLE_LIMITS.itemChars)
      fail('checklist', `a checklist item is longer than ${ROLE_LIMITS.itemChars} characters`);
  }
  return n.map((i) => i.trim());
}
