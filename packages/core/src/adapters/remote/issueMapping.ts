import { PLAN_ONLY_LABEL } from '../../model/brand';
import { parseMapBody } from '../../model/mapBody';
import { DEFAULT_MAP_MODE, type Comment, type DecisionRecord, type MapDoc } from '../../model/types';
import { settingsOf, type BodySettings } from './bodySettings';
import { parseDecisionComment } from './decisionComment';
import { readBody, readComment, splitBody } from './format';
import { teammateDecision } from './teammateDecision';
import type { Writer } from './writer';

export interface TrailIssueParts {
  id: string;
  key: string;
  title: string;
  labels: string[];
  body: string | null | undefined;
  /** Who last wrote the body, as far as the tracker says. */
  writer: Writer;
  /** The settings in force given the ones the body carries (settingsLedger.ts); missing: the body's own. */
  settle?: (found: BodySettings) => BodySettings;
  createdAt: string;
  updatedAt: string;
}

/** The trail issue as a map: plan-only by label, sections, verification level and model matching from the issue body. */
export function mapFromIssue(p: TrailIssueParts): MapDoc {
  // The map body guards its own fields and carries real assumption markers, so a trusted one is parsed as it
  // is; an outsider's comes back with every marker guarded, which makes its assumption markers text too.
  const { text, meta } = p.writer.kind === 'outsider' ? readBody(p.body, p.writer) : splitBody(p.body);
  const found = settingsOf({ ...meta });
  const { verification, guides, modelMatching } = p.settle ? p.settle(found) : found;
  return {
    id: p.id,
    key: p.key,
    title: p.title,
    mode: p.labels.includes(PLAN_ONLY_LABEL) ? 'plan-only' : DEFAULT_MAP_MODE,
    ...(verification ? { verification } : {}),
    ...(guides?.length ? { guides } : {}),
    ...(modelMatching ? { modelMatching } : {}),
    sections: parseMapBody(text),
    createdAt: Date.parse(p.createdAt) || 0,
    updatedAt: Date.parse(p.updatedAt) || 0,
  };
}

export interface IssueComment<Id> {
  id: Id;
  body: string;
  writer: Writer;
  createdAt: string;
}

/**
 * An issue's comments in order; decision records among them go to `onDecision` instead. A record counts when
 * this account posted it, or a teammate did (as that person's decision, in `tracker`); an outsider's, or one that
 * doesn't read as a record, is an ordinary comment: nothing is dropped.
 */
export function readIssueComments<Id>(
  mapId: string,
  comments: IssueComment<Id>[],
  tracker: string,
  onDecision: (d: DecisionRecord, commentId: Id) => void,
): Comment[] {
  const out: Comment[] = [];
  for (const c of comments) {
    const trusted = c.writer.kind !== 'outsider';
    const d = trusted ? parseDecisionComment(c.body) : undefined;
    if (d) {
      const record = c.writer.kind === 'teammate' ? teammateDecision(d, { name: c.writer.name, tracker }) : d;
      onDecision({ ...record, mapId }, c.id);
      continue;
    }
    out.push(readComment({ id: String(c.id), body: c.body, writer: c.writer, createdAt: c.createdAt }));
  }
  return out;
}
