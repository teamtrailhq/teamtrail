import { type AttentionItem, webUrl } from '@teamtrail/core';
import type { MenuItem } from '../../components/ui';
import { needAction } from './needAction';
import type { LoadedTicket } from './types';

/**
 * The primary action for what the queue holds on the ticket, when the state line asks it (needAction): one of the
 * ticket's own actions, opening the place it's handled, its pull request, or setting it aside. None when the item is
 * acted on in place (`inline`) or there is no way to here.
 */
export function needPrimary(p: {
  v: Pick<LoadedTicket, 'items' | 'pr'>;
  all: MenuItem[];
  onItem?: (item: AttentionItem) => void;
  onDismiss?: (id: string) => void;
}): MenuItem | undefined {
  const item = p.v.items[0];
  const act = item && needAction(item.kind)?.act;
  if (!item || !act) return undefined;
  const tip = item.title.split('\n')[0];
  switch (act.kind) {
    case 'menu':
      return p.all.find((a) => a.id === act.id);
    case 'item': {
      const open = p.onItem;
      return open && { id: 'need', label: act.label, tip, onSelect: () => open(item) };
    }
    case 'pr': {
      const url = webUrl(p.v.pr?.pr?.url);
      if (!url) return undefined;
      return { id: 'need', label: act.label, tip, onSelect: () => void window.open(url, '_blank', 'noopener') };
    }
    case 'dismiss': {
      const dismiss = p.onDismiss;
      return dismiss && { id: 'need', label: act.label, tip, onSelect: () => dismiss(item.id) };
    }
    case 'inline':
      return undefined;
    default: {
      const never: never = act;
      return never;
    }
  }
}
