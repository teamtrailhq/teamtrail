import { canonicalJson } from '../lib/canonicalJson';
import type { ReadinessFinding } from '../model/readiness';
import { contentHash } from '../trust/trustLedger';

/** The finding with `fixHash`, the hash of its fix exactly as shown: applying it must name it. */
export function withFixHash(f: ReadinessFinding): ReadinessFinding {
  return f.fix ? { ...f, fixHash: contentHash(canonicalJson(f.fix)) } : f;
}
