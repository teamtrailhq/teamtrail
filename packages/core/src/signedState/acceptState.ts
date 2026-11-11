import type { TrustItem } from '../trust/trustItem';
import { fieldsHash } from './stateFields';
import { stateItemOf } from './stateItem';
import type { StateContent, StateGroupContent } from './stateItems';
import { changeStateRecord, type StateEntries, type StateEntry } from './stateRecord';

/** One file's change accepted into the trail's entries. A trail's map removed: the whole trail is forgotten. */
function acceptOne(entries: StateEntries, shown: StateContent, by: string): StateEntries {
  const item = stateItemOf(shown.file);
  if (!item) throw new Error(`not a trail file: ${shown.file}`);
  if (shown.oversized && item.kind === 'map')
    throw new Error(`${shown.file} is too large to accept: restore it from git`);
  if (!shown.fields && item.kind === 'map') return {};
  const { [item.key]: was, ...rest } = entries;
  if (!shown.fields) return rest;
  const entry: StateEntry = { f: shown.fields, h: fieldsHash(shown.fields), by, at: Date.now() };
  if (was?.title) entry.title = was.title;
  if (item.kind === 'map' && was?.text) entry.text = was.text;
  if (shown.text) entry.text = shown.text;
  return { ...rest, [item.key]: entry };
}

/**
 * The trail lead accepts an outside change on this machine, as it was shown (`item.content`, whose hash the page
 * sent): those gate fields are signed as theirs, or a removal is accepted by dropping the item from the record (a
 * trail removed or renamed: its whole record). A trail's files nobody signed are accepted together. A file that
 * changed again since still differs from what is signed, so it waits again.
 */
export function acceptState(input: { root: string; item: Pick<TrustItem, 'content'>; by: string }) {
  const parsed = JSON.parse(input.item.content) as StateContent | StateGroupContent;
  const files = 'files' in parsed ? parsed.files : [parsed];
  const mapIds = new Set(files.map((f) => stateItemOf(f.file)?.mapId));
  if (mapIds.size !== 1) throw new Error('an approval covers one trail');
  const mapId = [...mapIds][0];
  if (!mapId) throw new Error('not a trail file');
  const by = `accepted by ${input.by}`;
  changeStateRecord(input.root, mapId, (entries) => files.reduce((acc, f) => acceptOne(acc, f, by), entries));
}
