import type { ChecklistAnswer, GuideAnswers, GuideDoc } from '../model/guide';
import { checkChecklist, checklistProblem } from './checklist';

/** What the checklists of a ticket's guides got: the answers to keep, and the refusal when any is incomplete. */
export interface ChecklistsResult {
  answered: GuideAnswers[];
  /** One sentence per incomplete guide; empty when every checklist has an answer for every item. */
  problems: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const isNumber = (item: string) => /^#?\d+$/.test(item.trim());

/**
 * The guides an answer is for: the one it names; else the only guide with a checklist; else every guide whose
 * checklist has an item with that text. A number without a guide can't be placed when several guides have one.
 */
function guidesOf(a: ChecklistAnswer, withList: GuideDoc[]): GuideDoc[] {
  if (a.guide) return withList.filter((g) => g.id === a.guide);
  if (withList.length === 1) return withList;
  if (isNumber(a.item)) return [];
  const text = norm(a.item).replace(/[.:;!]+$/, '');
  return withList.filter((g) => g.checklist.some((i) => norm(i).replace(/[.:;!]+$/, '') === text));
}

/**
 * Checks the answers against every guide's checklist, each on its own (checklist.ts): every item of every guide
 * needs an answer. An answer that fits no guide (a number with several guides, a guide the ticket doesn't take) is
 * reported under each guide with a checklist.
 */
export function checkGuideChecklists(guides: GuideDoc[], given: ChecklistAnswer[] = []): ChecklistsResult {
  const withList = guides.filter((g) => g.checklist.length);
  const per = new Map<string, ChecklistAnswer[]>(withList.map((g) => [g.id, []]));
  const stray: ChecklistAnswer[] = [];
  for (const a of given) {
    const to = guidesOf(a, withList);
    if (!to.length) stray.push(a);
    for (const g of to) per.get(g.id)!.push({ item: a.item, done: a.done, ...(a.note ? { note: a.note } : {}) });
  }
  const answered: GuideAnswers[] = [];
  const problems: string[] = [];
  for (const g of withList) {
    const c = checkChecklist(g.checklist, per.get(g.id));
    c.unknown.push(...stray.map((s) => (s.guide ? `${s.guide}: ${s.item}` : s.item)));
    const problem = checklistProblem(g, c);
    if (problem) problems.push(problem);
    answered.push({ guide: { id: g.id, version: g.version }, answers: c.answers });
  }
  return { answered, problems };
}
