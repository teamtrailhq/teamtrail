import { Logo } from '../../src/scout';

/**
 * The wordmark: the logo mark, then the name in Inter 600. The mark is 0.86em square, 0.24em before the name, its
 * centre on the lowercase letters' optical middle; it keeps its own colours on light and dark.
 */
export function Wordmark({ text }: { text: string }) {
  return (
    <div className="wordmark">
      <Logo className="wordmark-mark" />
      <span className="wordmark-name">{text}</span>
    </div>
  );
}
