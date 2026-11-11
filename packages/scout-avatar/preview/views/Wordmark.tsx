/** The wordmark: the name in the display face, ending at the trail's destination, an orange dot on the baseline. */
export function Wordmark({ text }: { text: string }) {
  return (
    <div className="wordmark">
      {text}
      <span className="wordmark-dot" aria-hidden="true" />
    </div>
  );
}
