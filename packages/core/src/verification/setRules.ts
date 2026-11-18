import { existsSync } from 'node:fs';
import path from 'node:path';
import { OperationError } from '../planning/operations/operationError';
import { checksApproval } from './checksApproval';
import { VERIFICATION_FILE } from './configFile';
import { MAX_RULES } from './parseRules';
import { readRawConfig } from './rawConfig';
import { StaleChecks } from './setChecks';
import { writeApprovedConfig } from './writeApprovedConfig';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** The next free `R-<n>` after every id in use. */
function nextId(used: Set<string>) {
  let n = 1;
  for (const id of used) n = Math.max(n, Number(id.slice(2)) + 1 || n);
  return `R-${n}`;
}

/**
 * The rules as the editor sent them, in the file's shape: a new rule (no id) gets the next free `R-<n>`, empty fields
 * are left out, and everything else is the parser's to judge (config.ts → parseRules.ts), so one set of rules holds.
 */
function shapeRules(rules: unknown): Obj[] {
  if (!Array.isArray(rules) || rules.length > MAX_RULES) throw new OperationError(`"rules" must list 0–${MAX_RULES}`);
  const used = new Set(rules.map((r) => (isObj(r) ? text(r.id) : undefined)).filter((id): id is string => !!id));
  return rules.map((r) => {
    if (!isObj(r)) throw new OperationError('each rule must be an object');
    const id = text(r.id) ?? nextId(used);
    used.add(id);
    const when = Array.isArray(r.when)
      ? r.when.map((g) => (typeof g === 'string' ? g.trim() : g)).filter((g) => g)
      : r.when;
    const check = text(r.check);
    const ask = text(r.ask);
    return { id, when, ...(check ? { check } : {}), ...(ask ? { ask } : {}), why: text(r.why) ?? '' };
  });
}

const summary = (n: number) => (n === 1 ? '1 diff rule' : `${n} diff rules`);

/**
 * The trail lead sets the diff rules (`rules` in verification.json) from the Lookout, approved in the same step. Only
 * over `base` (the file as they loaded it), and only while the file is the one approved here: approving it must never
 * approve check commands nobody looked at. A rule may only name a check the file already has. Journaled.
 */
export function setRules(o: { root: string; rules: unknown; base: string; by: string }) {
  const rules = shapeRules(o.rules);
  const now = checksApproval(o.root);
  if (o.base !== now.hash) throw new StaleChecks(`${VERIFICATION_FILE} changed since you opened it; look again`);
  const file = path.join(o.root, VERIFICATION_FILE);
  if (!existsSync(file)) throw new OperationError('Set the checks first: without them nothing is verified');
  if (now.waiting)
    throw new OperationError(`Approve ${VERIFICATION_FILE} first: it changed since it was approved here`);
  const { rules: _old, ...raw } = readRawConfig(file, { v: 1 });
  const written = `${JSON.stringify(rules.length ? { ...raw, rules } : raw, null, 2)}\n`;
  return writeApprovedConfig({
    root: o.root,
    text: written,
    by: o.by,
    subject: `diff rules: ${summary(rules.length)}`,
  });
}
