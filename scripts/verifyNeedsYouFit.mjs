// Needs you keeps every row inside its card (verifyHandsOff.mjs): a ticket with a long title and long criteria,
// open and closed, at phone, tablet, laptop and wide widths, day and night. Every element of the row stays within
// the row's box, the title's lines start right of its chip, and the page never scrolls sideways.
import path from 'node:path';
import { sessionHeaders } from './e2eHelpers.mjs';

const WIDTHS = [390, 768, 1024, 1334, 1720];

const LONG_TITLE = 'Add Bye component with looping fade in/out and render it on the home page under the greeting';
const LONG_CRITERIA = [
  'The text fades in, holds, fades out and repeats forever (CSS infinite animation, no JavaScript timers or intervals)',
  'Under prefers-reduced-motion the text shows without any animation and stays readable against both themes',
];

/** What sticks out of the row, the chip and title overlap, or the page scrolls sideways, measured in the page. */
function measure(title) {
  const row = [...document.querySelectorAll('.home-need')].find((r) => r.textContent.includes(title));
  if (!row) return { missing: true };
  const box = row.getBoundingClientRect();
  const out = [];
  for (const el of row.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.left < box.left - 1 || r.right > box.right + 1)
      out.push(
        `${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')} ${Math.round(r.left)}–${Math.round(r.right)} of ${Math.round(box.left)}–${Math.round(box.right)}`,
      );
  }
  const chip = row.querySelector('.home-chip')?.getBoundingClientRect();
  const titleEl = row.querySelector('.home-need-title');
  const range = document.createRange();
  if (titleEl) range.selectNodeContents(titleEl);
  // the title's line boxes, as the text runs (a range's rects, one per line it spans)
  const lines = titleEl ? [...range.getClientRects()].filter((l) => l.width > 0) : [];
  // every line of the title starts where its first does, and none runs beside or under the chip
  const ragged = lines.some((l) => Math.abs(l.left - (lines[0]?.left ?? 0)) > 1);
  const besideChip = !!chip && lines.some((l) => l.left < chip.right - 1 && l.top < chip.bottom - 1);
  const underChip = !lines.length || ragged || besideChip;
  const sideways = document.documentElement.scrollWidth > window.innerWidth + 1;
  return { out, underChip, sideways, open: row.classList.contains('open') };
}

/** The row with the long title, opened or closed as asked. */
async function setOpen(page, open) {
  const row = page.locator('.home-need', { hasText: LONG_TITLE.slice(0, 40) }).first();
  await row.waitFor({ timeout: 20_000 });
  const isOpen = await row.evaluate((r) => r.classList.contains('open'));
  if (isOpen !== open) await row.locator('.ds-row-main').click();
  if (open) await row.locator('.home-need-body').waitFor();
  else await row.locator('.home-need-body').waitFor({ state: 'detached' });
}

/** The trail lead sets a check in Settings → Verification: implementation tickets then agree criteria before work. */
async function setChecks(page) {
  const api = `${new URL(page.url()).origin}/__teamtrail/verification/config`;
  const headers = await sessionHeaders(page);
  const { approval } = await (await page.request.get(api, { headers })).json();
  const checks = [{ name: 'test', run: ['npm', 'test'] }];
  const put = await page.request.put(api, { headers, data: { checks, base: approval.base, acknowledged: true } });
  if (!put.ok()) throw new Error(`setting the checks: ${put.status()} ${await put.text()}`);
}

export async function needsYouFits({ page, call, shots }) {
  await setChecks(page);
  await call('add_ticket', {
    title: LONG_TITLE,
    type: 'execute',
    body: 'Part of the greeting.',
    criteria: LONG_CRITERIA.map((text) => ({ text, kind: 'unit' })),
  });
  const failures = [];
  const was = page.viewportSize();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const open of [false, true]) {
      await setOpen(page, open);
      for (const theme of ['night', 'day']) {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        const m = await page.evaluate(measure, LONG_TITLE);
        const where = `${width}px ${open ? 'open' : 'closed'} ${theme}`;
        if (m.missing) failures.push(`${where}: no row`);
        else if (m.out.length || m.underChip || m.sideways)
          failures.push(
            `${where}: ${[...m.out, m.underChip ? 'title under its chip' : '', m.sideways ? 'page scrolls sideways' : ''].filter(Boolean).join('; ')}`,
          );
        await page.mouse.move(0, 0);
        if (shots && (width === 1334 || width === 390))
          await page.screenshot({
            path: path.join(shots, `needs-you-long-${width}-${open ? 'open' : 'closed'}-${theme}.png`),
          });
      }
    }
  }
  await page.evaluate(() => delete document.documentElement.dataset.theme);
  if (was) await page.setViewportSize(was);
  return { ok: failures.length === 0, failures };
}
