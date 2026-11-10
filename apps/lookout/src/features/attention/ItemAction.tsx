import type { AttentionItem } from '@teamtrail/core';
import { IntegrationAction } from './IntegrationAction';
import { TrackerSettingsAction } from './TrackerSettingsAction';

/** The one-click trail lead action under a queue row, for the kinds that have one. */
export function ItemAction({ item }: { item: AttentionItem }) {
  if (item.kind === 'integration') return <IntegrationAction item={item} />;
  if (item.kind === 'tracker-settings' && item.ref.includes(':')) return <TrackerSettingsAction item={item} />;
  return null;
}
