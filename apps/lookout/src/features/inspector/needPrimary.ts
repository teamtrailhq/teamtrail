import { type AttentionItem, webUrl } from '@teamtrail/core';
import type { MenuItem } from '../../components/ui';
import { type NeedAct, needAction } from './needAction';
import type { LoadedTicket } from './types';

type Input = {
  v: Pick<LoadedTicket, 'items' | 'pr'>;
  all: MenuItem[];
  onItem?: (item: AttentionItem) => void;
  onDismiss?: (id: string) => void;
};

/**
 * The primary action for what the queue holds on the ticket, when the state line asks it (needAction): one of the
 * ticket's own actions (or what to do when it has none by that id), opening the place it's handled, its pull
 * request, or setting it aside. None when the item is acted on in place (`inline`) or there is no way to here.
 */
export function needPrimary(p: Input): MenuItem | undefined {
  const item = p.v.items[0];
  const act = item && needAction(item.kind)?.act;
  if (!item || !act) return undefined;
  return primaryFor(act, item, p);
}

function primaryFor(act: NeedAct, item: AttentionItem, p: Input): MenuItem | undefined {
  const tip = item.title.split('\n')[0];
  switch (act.kind) {
    case 'menu': {
      const own = p.all.find((a) => a.id === act.id);
      return own ?? (act.otherwise && primaryFor(act.otherwise, item, p));
    }
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
