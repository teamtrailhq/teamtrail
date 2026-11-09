/** A small "i" in a square that explains what it sits next to, on hover or keyboard focus (via the app tooltip). */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" data-tip={text} data-tip-scout tabIndex={0} role="img" aria-label={text}>
      <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <circle cx="7" cy="3.7" r="1.3" />
        <path d="M5.6 6.300H8v4.200h1v1.200H5v-1.200h1.200V7.500h-.6z" />
      </svg>
    </span>
  );
}
