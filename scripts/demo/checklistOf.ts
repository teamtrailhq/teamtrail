interface Guide {
  id: string;
  checklist: string[];
}

/** Every checklist item of a claimed ticket's guides answered, as a completion must: `{ checklist }`, or nothing. */
export function checklistOf(ticket: { guides?: Guide[] }) {
  const answers = (ticket.guides ?? []).flatMap((g) => g.checklist.map((item) => ({ guide: g.id, item, done: true })));
  return answers.length ? { checklist: answers } : {};
}
