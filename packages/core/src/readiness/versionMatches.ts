type Parts = number[];

/** `20.11.0` → [20, 11, 0]; `3.12.*` or `18.x` → [3, 12] / [18]; undefined when it isn't a version. */
function partsOf(v: string): Parts | undefined {
  const clean = v.trim().replace(/^v(?=\d)/, '');
  const words = clean.split('.');
  const out: number[] = [];
  for (const w of words) {
    if (/^[x*]$/i.test(w)) break;
    if (!/^\d+$/.test(w)) return undefined;
    out.push(Number(w));
  }
  return out.length ? out : undefined;
}

/** -1, 0 or 1, comparing only as many parts as `b` has (`20.11.0` equals `20`). */
function compare(a: Parts, b: Parts) {
  for (let i = 0; i < b.length; i++) {
    const x = a[i] ?? 0;
    if (x !== b[i]) return x < b[i] ? -1 : 1;
  }
  return 0;
}

/** One comparator (`>=18`, `^20.1`, `~3.12`, `~=3.10`, `20`), or undefined when it can't be read. */
function satisfies(version: Parts, comparator: string): boolean | undefined {
  const m = /^(>=|<=|>|<|==|=|~=|\^|~)?\s*(.+)$/.exec(comparator.trim());
  const want = m ? partsOf(m[2]) : undefined;
  if (!m || !want) return undefined;
  const c = compare(version, want);
  switch (m[1]) {
    case '>=':
      return c >= 0;
    case '<=':
      return c <= 0;
    case '>':
      return c > 0;
    case '<':
      return c < 0;
    case '~=':
      // PEP 440 compatible release: at least this, within all but its last part
      return c >= 0 && compare(version, want.slice(0, Math.max(1, want.length - 1))) === 0;
    case '^':
      return c >= 0 && compare(version, want[0] === 0 ? want.slice(0, 2) : want.slice(0, 1)) === 0;
    case '~':
      return c >= 0 && compare(version, want.length > 1 ? want.slice(0, 2) : want) === 0;
    default:
      // a bare version (or `=`): any version that starts with it
      return c === 0;
  }
}

/** Every comparator of one `||` branch: `>=18 <21`, `>=3.10,<4`. */
function branchHolds(version: Parts, branch: string): boolean | undefined {
  const comparators = branch
    .replace(/(>=|<=|>|<|==|~=|\^|~|=)\s+/g, '$1')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (!comparators.length) return undefined;
  let all = true;
  for (const c of comparators) {
    const ok = satisfies(version, c);
    if (ok === undefined) return undefined;
    all &&= ok;
  }
  return all;
}

/**
 * Whether `version` (what a program printed) is one `range` pins: `20`, `20.11.0`, `>=18 <21`, `^20.1`, `~3.12`,
 * `>=3.10,<4`, `~=3.10`, `18.x`, `20 || 22`. Undefined when either can't be read (`lts/*`, `stable`, `system`): then
 * nothing is said about it.
 */
export function versionMatches(range: string, version: string): boolean | undefined {
  const found = /\d+(?:\.\d+)*/.exec(version)?.[0];
  const parts = found ? partsOf(found) : undefined;
  if (!parts) return undefined;
  const results = range.split('||').map((b) => branchHolds(parts, b));
  if (results.some((r) => r === true)) return true;
  return results.some((r) => r === undefined) ? undefined : false;
}
