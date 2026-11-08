import { PLAN_ONLY_LABEL } from '../../model/brand';
import { levelOf } from '../../model/lifecycle';
import { parseMapBody } from '../../model/mapBody';
import { DEFAULT_MAP_MODE, type Comment, type DecisionRecord, type MapDoc } from '../../model/types';
import { parseDecisionComment, readComment, splitBody } from './format';

export interface TrailIssueParts {
  id: string;
  key: string;
  title: string;
  labels: string[];
  body: string | null | undefined;
  createdAt: string;
  updatedAt: string;
}

/** The trail issue as a map: plan-only by label, sections and verification level from the issue body. */
export function mapFromIssue(p: TrailIssueParts): MapDoc {
  const { text, meta } = splitBody(p.body);
  const verification = levelOf(meta.verification);
  const guides = Array.isArray(meta.guides) ? meta.guides.filter((r) => typeof r === 'string' && r) : [];
  return {
    id: p.id,
    key: p.key,
    title: p.title,
    mode: p.labels.includes(PLAN_ONLY_LABEL) ? 'plan-only' : DEFAULT_MAP_MODE,
    ...(verification ? { verification } : {}),
    ...(guides.length ? { guides } : {}),
    sections: parseMapBody(text),
    createdAt: Date.parse(p.createdAt) || 0,
    updatedAt: Date.parse(p.updatedAt) || 0,
  };
}

export interface IssueComment<Id> {
  id: Id;
  body: string;
  author?: string;
  createdAt: string;
}

/** An issue's comments in order; decision records among them go to `onDecision` instead. */
export function readIssueComments<Id>(
  mapId: string,
  comments: IssueComment<Id>[],
  onDecision: (d: DecisionRecord, commentId: Id) => void,
): Comment[] {
  const out: Comment[] = [];
  for (const c of comments) {
    const d = parseDecisionComment(c.body);
    if (d) {
      onDecision({ ...d, mapId }, c.id);
      continue;
    }
    const parsed = readComment({ id: String(c.id), body: c.body, author: c.author, createdAt: c.createdAt });
    if (parsed) out.push(parsed);
  }
  return out;
}
