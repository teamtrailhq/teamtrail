import type { AttentionItem } from '../model/attention';

/**
 * `fyi` items can be set aside, and so can a policy flag once the human has looked at the change, and an escape's
 * suggested rule once they've decided against it.
 */
export const isDismissable = (item: Pick<AttentionItem, 'kind' | 'urgency'>) =>
  item.urgency === 'fyi' || item.kind === 'policy' || item.kind === 'escape';
