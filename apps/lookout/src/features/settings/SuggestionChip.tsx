import type { CheckSuggestion } from '@teamtrail/core';

/** One suggested check as a chip: its command, and its folder when it isn't the top; where it was read on hover. */
export function SuggestionChip({ suggestion: s, onAdd }: { suggestion: CheckSuggestion; onAdd: () => void }) {
  const command = s.run.join(' ');
  const where = s.cwd ? ` in ${s.cwd}` : '';
  return (
    <button
      type="button"
      className="chip vf-suggestion"
      title={`From ${s.from}`}
      aria-label={`Add ${command}${where}`}
      onClick={onAdd}
    >
      <span className="t-code">{command}</span>
      {s.cwd && <span className="t-meta">in {s.cwd}</span>}
    </button>
  );
}
