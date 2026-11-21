import { LabelLine } from '../../components/ui';
import type { LabelPart } from '../../lib/labelParts';

/**
 * The bubble's bar: one mono label line across its top, the close button (MapBubble's) at its end. What the bubble
 * needs from you leads it, then the ticket's chips.
 */
export function BubbleBar(props: { parts: LabelPart[] }) {
  return (
    <div className="bubble-bar">
      <LabelLine parts={props.parts} />
    </div>
  );
}
