import type { TrustItem } from '../trust/trustItem';
import { contentHash } from '../trust/trustLedger';
import { outsideChanges, type OutsideChange } from './outsideChanges';
import type { Fields } from './stateFields';
import { stateItemFor } from './stateItem';
import { addedLines, changeLines } from './stateLines';

/** The trust key of an outside change: `state:<trail>:<item key>`, or `state:<trail>:added` for a trail's group. */
export const stateTrustKey = (c: Pick<OutsideChange, 'mapId' | 'key'>) => `state:${c.mapId}:${c.key}`;

const ADDED = 'added';

/** The trail file a state trust key is about: the item's own file, or the trail's map for a group. */
export function stateKeyFile(key: string): string | undefined {
  const m = key.match(/^state:([^:]+):(.+)$/);
  if (!m) return undefined;
  return m[2] === ADDED ? `${m[1]}/map.md` : stateItemFor(m[1], m[2])?.rel;
}

/** What accepting an outside change records, exactly: the file's gate fields as shown (none: accept the removal). */
export interface StateContent {
  file: string;
  fields: Fields | null;
  /** A decision's file, whose words the record keeps. */
  text?: string;
  /** Too large to read: accepting it drops it from the record, as for a removed file. */
  oversized?: boolean;
}

/** A trail's files nobody signed here, accepted together: `files` each as `StateContent`. */
export interface StateGroupContent {
  trail: string;
  files: StateContent[];
}

const sortedFields = (f?: Fields) =>
  f
    ? Object.fromEntries(
        Object.keys(f)
          .sort()
          .map((k) => [k, f[k]]),
      )
    : null;

const contentOf = (c: OutsideChange): StateContent => ({
  file: c.rel,
  fields: c.fields.includes('oversized') ? null : sortedFields(c.file),
  ...(c.text ? { text: c.text } : {}),
  ...(c.fields.includes('oversized') ? { oversized: true } : {}),
});

function what(c: OutsideChange) {
  if (c.kind === 'map') return `Trail ${c.mapId}`;
  if (c.kind === 'ticket') return `Ticket #${c.id}`;
  return `Decision ${c.id}`;
}

function titleOf(c: OutsideChange) {
  if (c.trail) return `${what(c)} removed or renamed outside Teamtrail`;
  if (c.fields.includes('oversized')) return `${what(c)} is too large to read (over 1 MB)`;
  if (c.fields.includes('removed')) return `${what(c)} removed outside Teamtrail`;
  if (!c.signed) return `${what(c)} added outside Teamtrail`;
  return `${what(c)} changed outside Teamtrail`;
}

/** What Revert does for one change: write the signed values back, delete a file nobody signed, or nothing. */
function revertOf(c: OutsideChange): TrustItem['revert'] {
  if (c.kind === 'map' && (c.trail || c.fields.includes('oversized'))) return 'none';
  if (c.signed) return 'restore';
  // With its record unreadable, a decision Teamtrail wrote reads as one nobody signed: never offer to delete it.
  return c.unreadable ? 'none' : 'delete';
}

/** One outside change as an approval: accepting it signs `content` as the human's (acceptState.ts). */
export function stateTrustItem(c: OutsideChange): TrustItem {
  const content = JSON.stringify(contentOf(c), null, 2);
  return {
    key: stateTrustKey(c),
    kind: 'state',
    hash: contentHash(content),
    content,
    standing: c.signed ? 'changed' : 'elsewhere',
    title: titleOf(c),
    lines: changeLines(c),
    warnings: [],
    mapId: c.mapId,
    revert: revertOf(c),
    ...(c.kind === 'ticket' ? { ticketId: c.id } : {}),
    ...(c.fields.includes('removed') ? {} : { file: c.rel }),
  };
}

/** A trail's map and tickets nobody signed here, as one approval: a renamed or new trail is accepted in one look. */
function groupItem(mapId: string, changes: OutsideChange[]): TrustItem {
  const sorted = [...changes].sort((a, b) => a.rel.localeCompare(b.rel, 'en', { numeric: true }));
  const group: StateGroupContent = { trail: mapId, files: sorted.map(contentOf) };
  const content = JSON.stringify(group, null, 2);
  const withMap = sorted.some((c) => c.kind === 'map');
  const tickets = sorted.filter((c) => c.kind === 'ticket');
  const many = tickets.length === 1 ? 'Ticket' : `${tickets.length} tickets`;
  const title = withMap ? `Trail ${mapId} added outside Teamtrail` : `${many} added outside Teamtrail on ${mapId}`;
  const files = sorted.map((c) => c.rel);
  const single = !withMap && tickets.length === 1 ? { ticketId: tickets[0].id } : {};
  const unsafe = withMap || sorted.some((c) => c.unreadable);
  return {
    key: `state:${mapId}:${ADDED}`,
    kind: 'state',
    hash: contentHash(content),
    content,
    standing: 'elsewhere',
    title,
    lines: addedLines(sorted),
    warnings: [],
    mapId,
    revert: unsafe ? 'none' : 'delete',
    ...(files.length === 1 ? { file: files[0] } : { files }),
    ...single,
  };
}

/** A map or ticket nobody signed here: grouped per trail. Decisions are always looked at one by one. */
const grouped = (c: OutsideChange) => !c.signed && c.kind !== 'decision' && c.fields[0] === ADDED;

/** Every outside change as an approval, with the changes each covers (revertState.ts reverts them). */
export function stateApprovals(root: string): { item: TrustItem; changes: OutsideChange[] }[] {
  const changes = outsideChanges(root).changes;
  const singles = changes.filter((c) => !grouped(c)).map((c) => ({ item: stateTrustItem(c), changes: [c] }));
  const trails = [...new Set(changes.filter(grouped).map((c) => c.mapId))];
  const groups = trails.map((mapId) => {
    const of = changes.filter((c) => grouped(c) && c.mapId === mapId);
    return { item: groupItem(mapId, of), changes: of };
  });
  return [...groups, ...singles];
}

/** Every outside change in the tracker folder, as approvals. */
export const stateItems = (root: string): TrustItem[] => stateApprovals(root).map((a) => a.item);
