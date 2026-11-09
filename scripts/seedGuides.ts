// M5 guides in the dev seed: a team on the main trail, guides on a few tickets, a catalog guide pinned with a check
// still waiting for approval, a hand-written guide waiting for approval, and checklist answers on a ticket.
import fs from 'node:fs';
import path from 'node:path';
import { setTicketGuide, setTrailTeam, type MapDoc, type TrackerAdapter } from '@teamtrail/core';
import { installGuide, guidesDir, writeChecklist } from '@teamtrail/core/agents';

interface SeedInput {
  root: string;
  adapter: TrackerAdapter;
  main: MapDoc;
  now: number;
}

const A11Y = `---
v: 1
id: a11y
name: Accessibility
version: 1.2.0
summary: Checks that the change works with a keyboard and a screen reader.
handles:
  types: [task, execute, prototype]
requiresChecks: [a11y]
proposedChecks:
  a11y:
    run: [npx, pa11y-ci, --config, .pa11yci.json]
    timeoutSec: 300
checklist:
  - Every new control can be reached and used with the keyboard alone
  - Images and icons have text alternatives
  - Colour is never the only way information is shown
author: Ada Lovelace
license: MIT
---

You make sure everyone can use what this ticket builds.

- Tab through every new screen and control. Focus must be visible and in a sensible order.
- Run the screen reader on the main flow and listen for unlabeled buttons.
- Check contrast of text and icons in both themes.
`;

const PERF = `---
v: 1
id: perf
name: Performance
version: 0.1.0
summary: Measures before and after, on a slow phone.
handles:
  types: [task, execute]
checklist:
  - Measured before and after on the same device
author: Fieldnote team
license: MIT
---

Measure the change on the slowest device you support, before and after, and write both numbers down.
`;

const GUIDES: [string, string][] = [
  ['Instrument current sync failure rate in production', 'qa'],
  ['Implement offline write queue behind a flag', 'security'],
  ['Schema migration strategy for offline clients', 'architect'],
  ['Conflict review UI: inline vs queue', 'a11y'],
];

export async function seedGuides({ root, adapter, main, now }: SeedInput) {
  installGuide({
    root,
    text: A11Y,
    source: { registry: 'https://raw.githubusercontent.com/teamtrailhq/teamtrail-guides/main', path: 'guides/a11y.md' },
    review: { verified: true, reviewedBy: ['teamtrail-maintainers'] },
    by: 'trail lead',
    now: now - 3 * 3_600_000,
  });
  // dropped in by hand, never approved: Settings → Guides asks the trail lead
  fs.writeFileSync(path.join(guidesDir(root), 'perf.md'), PERF);
  await setTrailTeam(adapter, main.id, ['qa', 'security', 'architect', 'a11y', 'reviewer'], 'trail lead');
  const snap = await adapter.loadMap(main.id);
  for (const [title, guide] of GUIDES) {
    const t = snap.tickets.find((x) => x.title === title);
    if (t) await setTicketGuide(adapter, { mapId: main.id, ticketId: t.id }, guide, 'trail lead');
  }
  const qa = snap.tickets.find((x) => x.title === GUIDES[0][0]);
  if (qa)
    writeChecklist(root, {
      v: 1,
      mapId: main.id,
      ticketId: qa.id,
      guide: { id: 'qa', version: '1.0.0' },
      answers: [
        { item: 'Ran the full test suite and it passes', done: true },
        { item: 'Added or updated tests that fail without the change', done: true },
        {
          item: 'Listed what you did not test, and why',
          done: false,
          note: 'Release builds only; staging has no failures to count',
        },
      ],
      by: 'codex-01',
      at: now - 40 * 60_000,
    });
}
