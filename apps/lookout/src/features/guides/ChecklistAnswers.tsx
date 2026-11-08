import type { ChecklistAnswer } from '@teamtrail/core';

/** Checklist answers as the agent gave them: done or not, with its note. */
export function ChecklistAnswers(props: { answers: ChecklistAnswer[] }) {
  return (
    <ul className="checklist-answers">
      {props.answers.map((a) => (
        <li key={a.item} className={a.done ? 'done' : 'not-done'}>
          <span className="mark" aria-label={a.done ? 'Done' : 'Not done'}>
            {a.done ? '✓' : '–'}
          </span>
          <span className="t-body">{a.item}</span>
          {a.note && <span className="t-meta note">{a.note}</span>}
        </li>
      ))}
    </ul>
  );
}
