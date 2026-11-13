import type { ReactNode } from 'react';

/** A zone with nothing to show yet: what will appear here and how to start, with optional `art` beside the words. */
export function EmptyState({ title, hint, art }: { title: string; hint?: string; art?: ReactNode }) {
  return (
    <div className={art ? 'empty-state has-art' : 'empty-state'}>
      {art}
      <div className="es-words">
        <span className="es-title">{title}</span>
        {hint && <span className="es-hint">{hint}</span>}
      </div>
    </div>
  );
}
