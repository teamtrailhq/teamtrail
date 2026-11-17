/** A finding's text, with the names it puts in backticks shown as code. */
export function FindingText({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((part, n) =>
        n % 2 ? (
          <code key={n} className="t-code">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
