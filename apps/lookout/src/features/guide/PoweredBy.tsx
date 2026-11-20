/**
 * The one line on the left of Get started's strip, which is otherwise empty: Powered by Teamtrail, made with love and
 * coffee. Shown only while the strip is, so it never takes room from the app on its own.
 */
export function PoweredBy() {
  return (
    <p className="powered-by">
      Powered by{' '}
      <a href="https://teamtrail.app" target="_blank" rel="noreferrer">
        Teamtrail
      </a>
      , made with{' '}
      <span role="img" aria-label="love">
        ❤️
      </span>{' '}
      +{' '}
      <span role="img" aria-label="coffee">
        ☕
      </span>
    </p>
  );
}
