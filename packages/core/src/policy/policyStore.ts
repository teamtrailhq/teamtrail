import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RiskPolicy } from '../model/risk';
import { contentHash, trustKey, trustLedger } from '../trust/trustLedger';
import { DEFAULT_POLICY } from './defaultPolicy';
import { parsePolicy, serializePolicy } from './policyFile';
import { stricterPolicy } from './stricterPolicy';

/** Committed next to `verification.json`, so the whole team shares one policy. */
export const POLICY_FILE = 'policy.json';

/**
 * The project's risk policy. `defaults` when there's no file. A file with errors also falls back to the
 * defaults, so a typo never lowers the bar, and the errors are reported for the Lookout to show.
 */
export interface PolicyRead {
  policy: RiskPolicy;
  errors: string[];
  defaults: boolean;
  /** Levels and path rules `policy.json` lowers that the trail lead hasn't approved on this machine. */
  pending?: { lowered: string[]; asked: RiskPolicy };
}

export const policyPath = (root: string) => path.join(root, POLICY_FILE);

/** `policy.json` exactly as the file has it; the defaults when it is missing or broken. */
export function readPolicyFile(root: string): PolicyRead {
  const f = policyPath(root);
  if (!existsSync(f)) return { policy: DEFAULT_POLICY, errors: [], defaults: true };
  const { policy, errors } = parsePolicy(readFileSync(f, 'utf8'));
  if (policy) return { policy, errors, defaults: false };
  return { policy: DEFAULT_POLICY, errors, defaults: true };
}

/** The policy the trail lead last approved on this machine; the defaults until they approve one. */
export function approvedPolicy(root: string): RiskPolicy {
  const content = trustLedger(root).get(trustKey.policy)?.content;
  return (content ? parsePolicy(content).policy : undefined) ?? DEFAULT_POLICY;
}

/**
 * The policy in force on this machine. The file is committed, so an agent or a teammate's push can lower a level
 * or drop a path rule to keep the human out of a high-risk decision. Raising applies at once; lowering waits until
 * the trail lead approves it here (`pending` lists what waits), and the approved levels hold meanwhile.
 */
export function readPolicy(root: string): PolicyRead {
  const read = readPolicyFile(root);
  const { policy, lowered } = stricterPolicy(read.policy, approvedPolicy(root));
  if (!lowered.length) return read;
  return { ...read, policy, pending: { lowered, asked: read.policy } };
}

export function writePolicy(root: string, policy: RiskPolicy) {
  mkdirSync(root, { recursive: true });
  writeFileSync(policyPath(root), serializePolicy(policy));
}

/** The trail lead saved `policy` on this machine: what it lowers takes effect. */
export function approvePolicyHere(root: string, by: string, policy: RiskPolicy) {
  const content = serializePolicy(policy);
  trustLedger(root).set({ [trustKey.policy]: { hash: contentHash(content), at: Date.now(), by, content } });
}
