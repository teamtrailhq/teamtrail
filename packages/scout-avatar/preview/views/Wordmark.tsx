/** The wordmark: the name in Inter 600, ending at the trail's destination, a blaze dot on the baseline. */
export function Wordmark({ text }: { text: string }) {
  return (
    <div className="wordmark">
      {text}
      <span className="wordmark-dot" aria-hidden="true" />
    </div>
  );
}
