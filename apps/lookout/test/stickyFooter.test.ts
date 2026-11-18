import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const css = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/styles/ticket.css'),
  'utf8',
);
const rule = (selector: string) =>
  css.match(new RegExp(`${selector.replace(/[.()>:]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1];

/**
 * A sticky footer stops at its scroll container's padding edge: the full ticket's container keeps no bottom padding,
 * so the actions sit flush with the drawer's bottom edge on an opaque surface, with nothing showing under them.
 */
test("the full ticket's actions sit flush at the bottom, opaque, with a top rule", () => {
  expect(rule('.zone-b:has(> .ticket-panel)')).toMatch(/padding-bottom:\s*0/);
  const sticky = rule('.ticket-footer.sticky');
  expect(sticky).toMatch(/bottom:\s*0/);
  expect(sticky).toMatch(/background:\s*var\(--panel-solid\)/);
  expect(rule('.detail > .ticket-footer')).toMatch(/border-top:\s*1px solid/);
});
