import type { AttentionItem } from '../model/attention';

/** Kinds that can be set aside whatever their urgency. */
const SET_ASIDE = new Set<AttentionItem['kind']>(['policy', 'escape', 'tracker-refused']);

/**
 * `fyi` items can be set aside, and so can a policy flag once the human has looked at the change, an escape's
 * suggested rule once they've decided against it, and a write the tracker refused (a new refusal is a new item).
 */
export const isDismissable = (item: Pick<AttentionItem, 'kind' | 'urgency'>) =>
  item.urgency === 'fyi' || SET_ASIDE.has(item.kind);
