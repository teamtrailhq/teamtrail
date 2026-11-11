import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { journalFile } from '../history/journalFile';
import { TRUST_JOURNAL } from '../model/lifecycle';
import { contentHash } from '../trust/trustLedger';
import { effectiveText } from './effectiveText';
import { codecOf } from './itemCodec';
import { outsideChanges, type OutsideChange } from './outsideChanges';
import { fieldsHash } from './stateFields';
import { stateTrustItem } from './stateItems';
import { entriesToChange, withStateLock, writeStateRecord, type StateEntry } from './stateRecord';

/** The file as it was signed: its gate fields put back (a decision's words from the record), or the removed file. */
function restored(root: string, c: OutsideChange, raw: string | undefined, entry?: StateEntry): string | undefined {
  if (raw === undefined) return entry ? effectiveText(root, c, undefined).text : undefined;
  const codec = codecOf(c);
  const from = c.kind === 'decision' && c.fields.includes('words') && entry?.text ? entry.text : raw;
  return codec.serialize(codec.apply(codec.parse(from), c.counts!));
}

function revertOne(root: string, c: OutsideChange, by: string) {
  withStateLock(root, c.mapId, () => {
    const file = path.join(root, c.rel);
    // A decision nobody signed isn't one: reverting it removes the file.
    if (!c.counts) return rmSync(file, { force: true });
    let raw: string | undefined;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      raw = undefined;
    }
    const entries = entriesToChange(root, c.mapId);
    const was = entries[c.key];
    const text = restored(root, c, raw, was);
    if (text === undefined) return;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    const f = was?.f ?? c.counts;
    entries[c.key] = { ...was, f, h: fieldsHash(f), file: contentHash(text), by: `reverted by ${by}`, at: Date.now() };
    writeStateRecord(root, c.mapId, entries);
  });
}

/**
 * The trail lead reverts an outside change on this machine: Teamtrail writes the signed values back into the file
 * (a removed ticket or decision comes back from the record; a decision nobody signed is removed). `hash` is the one
 * the page showed (stateItems.ts): if the file changed since, nothing is written. Journaled under `_trust`.
 */
export function revertState(input: { root: string; key: string; hash: string; by: string }) {
  const { root, key, hash, by } = input;
  const change = outsideChanges(root).changes.find((c) => stateTrustItem(c).key === key);
  if (!change) throw new Error('That change is gone: nothing to revert.');
  const item = stateTrustItem(change);
  if (item.hash !== hash) throw new Error('That file changed since you looked at it: review it again.');
  revertOne(root, change, by);
  journalFile(root).append({
    v: 1,
    kind: 'trust',
    at: Date.now(),
    mapId: TRUST_JOURNAL,
    action: 'reverted',
    subject: item.title,
    detail: item.hash,
    actor: by,
    actorKind: 'trail lead',
  });
}
