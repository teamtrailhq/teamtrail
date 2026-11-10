import { createHash } from 'node:crypto';

/** The value with object keys in order, so the same content always hashes the same. */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (!v || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .map((k) => [k, stable(o[k])]),
  );
}

/** sha256 of a value's content: what an approval names, so it applies only to exactly what the human was shown. */
export const contentHash = (v: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(stable(v)))
    .digest('hex');
