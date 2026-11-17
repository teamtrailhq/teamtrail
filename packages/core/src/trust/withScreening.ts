import type { RepoFiles } from '../model/checkScreening';
import { parseVerificationConfig } from '../verification/config';
import { screenConfig } from '../verification/screenConfig';
import type { TrustItem } from './trustItem';

/**
 * The items with `screening` set on the check commands: what reading the repo says about whether each command the
 * approval would cover can run (verification/screenChecks.ts). Read from the item's own content, the text approving
 * approves, never the file again. Other items, and every item without the repo's files, are as they were.
 */
export async function withScreening(items: TrustItem[], files: RepoFiles | undefined): Promise<TrustItem[]> {
  if (!files) return items;
  return Promise.all(
    items.map(async (item) => {
      if (item.kind !== 'checks') return item;
      const { config } = parseVerificationConfig(item.content);
      const screening = await screenConfig({ config, files });
      return screening.length ? { ...item, screening } : item;
    }),
  );
}
