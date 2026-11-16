import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const styles = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/styles');

/**
 * A `var(--x)` with no `--x` defined anywhere is invalid where it's used, so the property falls back to its initial
 * value. That hid Scout's Get started guide: `right` and `bottom` became `auto` and the fixed corner sat below the
 * window.
 */
test('every custom property the stylesheets use without a fallback is defined in them', () => {
  const css = readdirSync(styles)
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(path.join(styles, f), 'utf8'))
    .join('\n');
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const used = [...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]);
  expect([...new Set(used.filter((name) => !defined.has(name)))]).toEqual([]);
});
