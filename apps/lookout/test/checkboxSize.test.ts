import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const styles = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/styles');
const css = readFileSync(path.join(styles, 'design-system.css'), 'utf8');

/**
 * The text-field rule (`input { width: 100%; height: var(--h-md) }`) used to size every checkbox too, so one without
 * its own reset, the reroute dialog's "I've seen what changed", grew to the field's height. The design system sizes
 * them once, for every form.
 */
test('checkboxes keep their own size and take the accent, everywhere', () => {
  const rule = css.match(/input\[type='checkbox'\],\s*input\[type='radio'\]\s*\{([^}]*)\}/)?.[1];
  expect(rule).toMatch(/width:\s*auto/);
  expect(rule).toMatch(/height:\s*auto/);
  expect(rule).toMatch(/accent-color:\s*var\(--accent\)/);
  expect(css.indexOf("input[type='checkbox']")).toBeGreaterThan(css.indexOf('height: var(--h-md)'));
  const reroute = readFileSync(path.join(styles, 'reroute.css'), 'utf8');
  expect(reroute).not.toMatch(/\.reroute-seen input\s*\{[^}]*(width|height)/);
});
