import type { ChecklistAnswer } from '../model/role';

export interface ChecklistCheck {
  /** Items without an answer. */
  missing: string[];
  /** Answers that match no item. */
  unknown: string[];
  /** The answers, each under its item's exact text, in checklist order. */
  answers: ChecklistAnswer[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.:;!]+$/, '')
    .trim();

/** The item an answer is for: its text (case and spacing don't matter) or its number (`1`, `#1`). */
function itemOf(items: string[], answer: string) {
  const n = /^#?(\d+)$/.exec(answer.trim());
  if (n) return items[Number(n[1]) - 1];
  return items.find((i) => norm(i) === norm(answer));
}

/** Whether every checklist item has an answer. Presence is checked, not truth: `done: false` with a note is an answer. */
export function checkChecklist(items: string[], given: ChecklistAnswer[] = []): ChecklistCheck {
  const byItem = new Map<string, ChecklistAnswer>();
  const unknown: string[] = [];
  for (const a of given) {
    const item = itemOf(items, a.item);
    if (item) byItem.set(item, { ...a, item });
    else unknown.push(a.item);
  }
  return {
    missing: items.filter((i) => !byItem.has(i)),
    unknown,
    answers: items.filter((i) => byItem.has(i)).map((i) => byItem.get(i)!),
  };
}

/** The refusal an agent gets when its checklist is incomplete; undefined when it's complete. */
export function checklistProblem(role: { id: string; name: string }, c: ChecklistCheck) {
  if (!c.missing.length && !c.unknown.length) return undefined;
  const parts = [
    `The ${role.name} role (${role.id}) needs an answer for every checklist item.`,
    ...(c.missing.length ? [`Missing: ${c.missing.map((m) => `"${m}"`).join('; ')}.`] : []),
    ...(c.unknown.length ? [`Not on the checklist: ${c.unknown.map((m) => `"${m}"`).join('; ')}.`] : []),
    'Pass checklist: [{ item, done, note? }], one per item, with the item text or its number.',
  ];
  return parts.join(' ');
}
