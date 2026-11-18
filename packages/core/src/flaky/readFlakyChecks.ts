import type { TrackerAdapter } from '../adapters/adapter';
import type { FlakyChecksView } from '../model/flaky';
import { trustedChecks } from '../verification/checksApproval';
import { readAttempts } from '../verification/evidenceStore';
import { gateModeFor } from '../verification/gateModeFor';
import { flakyRows, type FlakyTicket } from './flakyRows';

/** Every trail's ticket attempts on this machine, read into the project's flaky checks. */
export async function readFlakyChecks(root: string, adapter: TrackerAdapter): Promise<FlakyChecksView> {
  const tickets: FlakyTicket[] = [];
  for (const summary of await adapter.listMaps()) {
    const snap = await adapter.loadMap(summary.id);
    for (const t of snap.tickets) {
      if (t.type === 'review') continue;
      const attempts = readAttempts(root, snap.map.id, t.id);
      if (attempts.length > 1) tickets.push({ key: t.key, attempts });
    }
  }
  return { rows: flakyRows(tickets), mode: gateModeFor(trustedChecks(root).config.config, 'flaky') };
}
