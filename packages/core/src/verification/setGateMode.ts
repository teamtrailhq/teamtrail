import { existsSync } from 'node:fs';
import path from 'node:path';
import { GATE_MODES, GATE_NAMES, type GateMode, type GateName } from '../model/gateMode';
import { OperationError } from '../planning/operations/operationError';
import { checksApproval } from './checksApproval';
import { VERIFICATION_FILE } from './configFile';
import { readRawConfig } from './rawConfig';
import { StaleChecks } from './setChecks';
import { writeApprovedConfig } from './writeApprovedConfig';

const LABEL: Record<GateMode, string> = {
  off: 'off',
  observe: 'observed, nothing held',
  enforce: 'enforced, work held for a person',
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The trail lead sets how one verification gate acts (`gates` in verification.json: off, observe or enforce), from
 * the Lookout, approved in the same step. Only over `base` (the file as they loaded it), and only while the file is
 * the one approved here: approving it must never approve check commands nobody looked at. Needs the file: without
 * one nothing is verified, so no gate runs. The other gates and every other field are kept as they are. Journaled.
 */
export function setGateMode(o: { root: string; gate: unknown; mode: unknown; base: string; by: string }) {
  if (!GATE_NAMES.includes(o.gate as GateName)) throw new OperationError(`"gate" must be ${GATE_NAMES.join(', ')}`);
  if (!GATE_MODES.includes(o.mode as GateMode)) throw new OperationError(`"mode" must be ${GATE_MODES.join(', ')}`);
  const gate = o.gate as GateName;
  const mode = o.mode as GateMode;
  const now = checksApproval(o.root);
  if (o.base !== now.hash) throw new StaleChecks(`${VERIFICATION_FILE} changed since you opened it; look again`);
  const file = path.join(o.root, VERIFICATION_FILE);
  if (!existsSync(file)) throw new OperationError('Set the checks first: without them nothing is verified');
  if (now.waiting)
    throw new OperationError(`Approve ${VERIFICATION_FILE} first: it changed since it was approved here`);
  const raw = readRawConfig(file, { v: 1 });
  const gates = { ...(isObject(raw.gates) ? raw.gates : {}), [gate]: mode };
  const text = `${JSON.stringify({ ...raw, gates }, null, 2)}\n`;
  return writeApprovedConfig({ root: o.root, text, by: o.by, subject: `verification gate ${gate}: ${LABEL[mode]}` });
}
