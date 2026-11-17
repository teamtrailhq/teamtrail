import { canonicalJson } from '../lib/canonicalJson';
import { contentHash } from '../trust/trustLedger';

/**
 * What accepting an unverified proof covers: the commit it is about and every gap, in order. `sha256:` of their
 * canonical JSON, so the Lookout, the engine and a server that merges all compare the same thing.
 */
export const gapsHash = (o: { head: string | null; gaps: string[] }) =>
  contentHash(canonicalJson({ head: o.head, gaps: o.gaps }));
