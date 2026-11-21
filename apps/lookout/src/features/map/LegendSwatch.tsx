import { StatusMark } from '../../components/ui';

export type Swatch = 'working' | 'needs' | 'held' | 'ready' | 'backlog' | 'verified' | 'done' | 'cancelled';

/** A card in miniature: its edge as the map draws it, the cursor for an agent at work, a tick once done. */
export function LegendSwatch({ swatch }: { swatch: Swatch }) {
  if (swatch === 'verified') return <StatusMark kind="verified" />;
  if (swatch === 'done') return <StatusMark kind="done" />;
  return (
    <span className={`lg-swatch lg-${swatch}`} aria-hidden="true">
      {swatch === 'working' && <i />}
    </span>
  );
}
