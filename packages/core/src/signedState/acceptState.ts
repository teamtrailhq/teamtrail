import type { TrustItem } from '../trust/trustItem';
import { fieldsHash } from './stateFields';
import { stateItemOf } from './stateItem';
import type { StateContent } from './stateItems';
import { changeStateRecord, type StateEntry } from './stateRecord';

/**
 * The trail lead accepts an outside change on this machine, as it was shown (`item.content`, whose hash the page
 * sent): those gate fields are signed as theirs, or a removal is accepted by dropping the item from the record. A
 * file that changed again since still differs from what is signed, so it waits again.
 */
export function acceptState(input: { root: string; item: Pick<TrustItem, 'content'>; by: string }) {
  const shown = JSON.parse(input.item.content) as StateContent;
  const item = stateItemOf(shown.file);
  if (!item) throw new Error(`not a trail file: ${shown.file}`);
  const by = `accepted by ${input.by}`;
  changeStateRecord(input.root, item.mapId, (entries) => {
    const { [item.key]: was, ...rest } = entries;
    if (!shown.fields) return rest;
    const entry: StateEntry = { f: shown.fields, h: fieldsHash(shown.fields), by, at: Date.now() };
    if (was?.title) entry.title = was.title;
    if (shown.text) entry.text = shown.text;
    return { ...rest, [item.key]: entry };
  });
}
