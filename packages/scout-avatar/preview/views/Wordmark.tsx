/** The wordmark: the name in Inter 600, followed by a blaze block cursor on the baseline, still. */
export function Wordmark({ text }: { text: string }) {
  return (
    <div className="wordmark">
      {text}
      <span className="wordmark-cursor" aria-hidden="true" />
    </div>
  );
}
