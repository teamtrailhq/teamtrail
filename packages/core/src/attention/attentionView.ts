import type { TrackerAdapter } from '../adapters/adapter';
import type { AttentionView } from '../model/attention';
import { readAttentionPolicy, readAttentionPrefs } from './attentionStore';
import { buildAttention } from './buildAttention';
import { focusState, isFocused, isInterrupting } from './focus';
import { gatherAttention } from './gatherAttention';

/** The ranked queue as the Lookout, `list_inbox` and `status` see it. */
export async function attentionView(input: {
  root: string;
  adapter: TrackerAdapter;
  /** Where this person's prefs live; defaults to the user config dir. */
  configDir?: string;
  now?: number;
}): Promise<AttentionView> {
  const now = input.now ?? Date.now();
  const policy = readAttentionPolicy(input.root);
  const prefs = readAttentionPrefs(input.configDir);
  const gathered = await gatherAttention({ root: input.root, adapter: input.adapter, policy: policy.value, now });
  const { items, hidden } = buildAttention(gathered);
  const focused = isFocused(prefs, now);
  const wouldInterrupt = items.filter((i) => i.score >= policy.value.interrupt).length;
  return {
    items,
    interrupting: items.filter((i) => isInterrupting(i, policy.value, prefs, now)).map((i) => i.id),
    policy: { file: policy.file, exists: policy.exists, errors: policy.errors, value: policy.value },
    prefs,
    focused,
    focus: focusState(prefs, now),
    heldBack: focused ? wouldInterrupt : 0,
    hidden,
  };
}
