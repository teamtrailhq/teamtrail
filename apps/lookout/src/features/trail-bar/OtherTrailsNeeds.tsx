import type { AttentionItem, AttentionView, MapSnapshot, PendingQuestion } from '@teamtrail/core';
import { SectionHeader } from '../../components/ui';
import { AttentionQueue, type AttentionHandlers } from '../attention';

/**
 * Under Needs you, what waits on you on other trails: its own group, so the trail on screen keeps one count. Each
 * row names its trail and opens it there.
 */
export function OtherTrailsNeeds(props: {
  view: AttentionView;
  items: AttentionItem[];
  snaps: Record<string, MapSnapshot>;
  pending: PendingQuestion[];
  currentMapId?: string;
  handlers: AttentionHandlers;
  onSnooze: (id: string, minutes: number) => void;
  onDismiss: (id: string) => void;
}) {
  if (!props.items.length) return null;
  return (
    <div className="other-trails">
      <SectionHeader title="Other trails" count={<span className="n mono-label">{props.items.length}</span>} />
      <AttentionQueue
        view={{ ...props.view, items: props.items }}
        snaps={props.snaps}
        pending={props.pending}
        currentMapId={props.currentMapId}
        handlers={props.handlers}
        onSnooze={props.onSnooze}
        onDismiss={props.onDismiss}
      />
    </div>
  );
}
