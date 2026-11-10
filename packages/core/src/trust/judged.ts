import { firstLines, lineDiff } from './lineDiff';
import { contentHash, type TrustRecord } from './trustLedger';

/** A piece of content against the ledger: nothing when approved, else the item's shared fields. */
export function judged(ledger: Record<string, TrustRecord>, key: string, content: string) {
  const hash = contentHash(content);
  const rec = ledger[key];
  if (rec?.hash === hash) return undefined;
  const standing = rec ? ('changed' as const) : ('elsewhere' as const);
  const lines = rec?.content ? lineDiff(rec.content, content) : firstLines(content);
  return { key, hash, content, standing, lines, warnings: [] as string[] };
}
