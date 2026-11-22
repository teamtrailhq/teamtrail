import { changeParts } from './changeParts';

/**
 * A changed line of the approval diff: the old value struck through, then the new one. Its text stays the line as
 * written (`name: old → new`), so copying it or reading it aloud gives exactly what changed.
 */
export function ChangedLine(props: { text: string }) {
  const { head, was, now } = changeParts(props.text);
  return (
    <>
      {head}
      <s className="ap-old">{was}</s> → {now}
    </>
  );
}
