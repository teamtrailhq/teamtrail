import { Clamp, DetailSection } from '../../components/ui';

/** The destination's bubble starts with what it is: the trail's destination as markdown, cut to a few lines. */
export function DestinationPart({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <DetailSection label="What is true when it's done" className="bubble-destination">
      <Clamp markdown text={text} />
    </DetailSection>
  );
}
