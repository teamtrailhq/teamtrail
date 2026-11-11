import { parseDecision } from '../planning/decisions/decisionFile';
import type { TrustItem } from '../trust/trustItem';
import { contentHash } from '../trust/trustLedger';
import { outsideChanges, type OutsideChange } from './outsideChanges';
import type { FieldValue, Fields } from './stateFields';
import { stateItemFor } from './stateItem';

/** The trust key of an outside change: `state:<trail>:<item key>`. */
export const stateTrustKey = (c: Pick<OutsideChange, 'mapId' | 'key'>) => `state:${c.mapId}:${c.key}`;

/** The trail file an outside change's trust key names, or undefined for any other key. */
export function stateKeyFile(key: string): string | undefined {
  const m = key.match(/^state:([^:]+):(.+)$/);
  return m ? stateItemFor(m[1], m[2])?.rel : undefined;
}

/** What accepting an outside change records, exactly: the file's gate fields as shown (none: accept the removal). */
export interface StateContent {
  file: string;
  fields: Fields | null;
  /** A decision's file, whose words the record keeps. */
  text?: string;
}

const show = (v: FieldValue | undefined) => {
  if (v === null || v === undefined || v === '') return '(none)';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(none)';
  return String(v);
};

function what(c: OutsideChange) {
  if (c.kind === 'map') return `Trail ${c.mapId}`;
  if (c.kind === 'ticket') return `Ticket #${c.id}`;
  return `Decision ${c.id}`;
}

function titleOf(c: OutsideChange) {
  if (c.fields.includes('removed')) return `${what(c)} removed outside Teamtrail`;
  if (!c.signed && c.kind === 'decision') return `${what(c)} added outside Teamtrail`;
  return `${what(c)} changed outside Teamtrail`;
}

/** Old → new per field; a decision nobody signed shows who it says decided and what. */
function linesOf(c: OutsideChange): string[] {
  if (c.fields.includes('removed')) return [`${c.rel} was deleted`];
  if (c.kind === 'decision' && !c.signed) {
    const d = c.text ? parseDecision(c.text) : undefined;
    return [
      `decided_by: ${show(c.file?.decided_by)}`,
      `source: ${show(c.file?.source)}`,
      `answer: ${d?.summary ?? ''}`,
    ];
  }
  return c.fields.map((k) =>
    k === 'words'
      ? 'the question, the answer or the human’s words were edited'
      : `${k}: ${show(c.counts?.[k])} → ${show(c.file?.[k])}`,
  );
}

function contentOf(c: OutsideChange): string {
  const fields = c.file
    ? Object.fromEntries(
        Object.keys(c.file)
          .sort()
          .map((k) => [k, c.file![k]]),
      )
    : null;
  const content: StateContent = { file: c.rel, fields, ...(c.text ? { text: c.text } : {}) };
  return JSON.stringify(content, null, 2);
}

/** One outside change as an approval: accepting it signs `content` as the human's (acceptState.ts). */
export function stateTrustItem(c: OutsideChange): TrustItem {
  const content = contentOf(c);
  return {
    key: stateTrustKey(c),
    kind: 'state',
    hash: contentHash(content),
    content,
    standing: c.signed ? 'changed' : 'elsewhere',
    title: titleOf(c),
    lines: linesOf(c),
    warnings: [],
    mapId: c.mapId,
    ...(c.kind === 'ticket' ? { ticketId: c.id } : {}),
    ...(c.fields.includes('removed') ? {} : { file: c.rel }),
  };
}

/** Every outside change in the tracker folder, as approvals. */
export const stateItems = (root: string): TrustItem[] => outsideChanges(root).changes.map(stateTrustItem);
