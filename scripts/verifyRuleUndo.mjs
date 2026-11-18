// Diff rules' Go without and its Undo, a step of verifyRules.mjs in the full ticket of a completion held for R-1: the
// trail lead goes without R-1, the ticket shows "Went without R-1" with Undo, Undo removes it, and the agent's next
// completion without the answer is held for R-1 again.
import path from 'node:path';

/** Go without R-1 in the full ticket, then Undo it; true when every step showed and the rule asks again. */
export async function goWithoutThenUndo({ page, call, key, ask, shots }) {
  const section = page.locator('.ticket-drawer .dr-rules');
  const held = section.locator('.dr-held');
  // a row's actions show on hover, as a person reaches for them
  const row = held.locator('.ds-row', { hasText: ask });
  await row.hover();
  await row.getByRole('button', { name: 'Go without' }).click();
  await held.getByLabel('Why R-1 can go unanswered').fill('No transcripts exist yet');
  await held.getByRole('button', { name: 'Go without R-1' }).click();
  const waived = section.locator('.dr-waived', { hasText: 'Went without R-1' });
  await waived.waitFor({ timeout: 15_000 });
  const reason = await waived.getByText('No transcripts exist yet').count();
  if (shots) await page.screenshot({ path: path.join(shots, 'diff-rules-waived.png') });
  await waived.locator('.ds-row').hover();
  await waived.getByRole('button', { name: 'Undo going without R-1' }).click();
  await waived.waitFor({ state: 'detached', timeout: 15_000 });
  const again = await call('close_ticket', { ticket: key, resolution: 'Added the field' }).then(
    () => '',
    (e) => e.message,
  );
  return reason > 0 && again.includes(`R-1 asks: ${ask}`);
}
