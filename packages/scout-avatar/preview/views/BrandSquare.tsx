import { Badge, Logo } from '../../src/scout';
import { WORDMARK } from '../content';
import { Wordmark } from './Wordmark';

/** The wordmark's width in em (`teamtrail.` in Londrina Solid 900), to size it to a share of the square. */
const WORDMARK_EM = 4.15;

/**
 * Brand exports: the logo tile, the wordmark on a dark square, or Scout's badge for places where Scout is the one
 * talking, like Slack. `theme` picks the logo's version and the background it sits on.
 */
export function BrandSquare({
  n,
  who,
  theme,
}: {
  n: number;
  who: 'logo' | 'scout' | 'wordmark';
  theme: 'light' | 'dark';
}) {
  if (who === 'wordmark')
    return (
      <div
        className="brand-square wordmark-square"
        data-capture="square"
        style={{ width: n, height: n, ['--u' as string]: `${(n * 0.8) / WORDMARK_EM / 130}px` }}
      >
        <Wordmark text={WORDMARK} />
      </div>
    );
  return (
    <div className={`brand-square ${theme}`} data-capture="square" style={{ width: n, height: n }}>
      {who === 'scout' ? <Badge size={Math.round(n * 0.86)} /> : <Logo size={n} theme={theme} />}
    </div>
  );
}
