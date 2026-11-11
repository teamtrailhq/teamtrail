import { Wordmark } from './Wordmark';

/** The wordmark lockup: `teamtrail.` alone, cream on dark or deep moss on light. */
export function Lockup({ w, h, wordmark, light }: { w: number; h: number; wordmark: string; light?: boolean }) {
  return (
    <div
      className={light ? 'lockup light' : 'lockup'}
      data-capture="lockup"
      style={{ width: w, height: h, ['--u' as string]: `${(h * 0.6) / 130}px` }}
    >
      <Wordmark text={wordmark} />
    </div>
  );
}
