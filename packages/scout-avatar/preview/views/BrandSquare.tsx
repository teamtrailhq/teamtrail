import { Badge, Logo, type ScoutGround } from '../../src/scout';
import { WORDMARK } from '../content';
import { Wordmark } from './Wordmark';

/** The wordmark's width in em (`teamtrail` and its cursor in Inter 600), to size it to a share of the square. */
const WORDMARK_EM = 4.6;

/**
 * Brand exports: the logo tile, the wordmark on a dark square, or Scout's avatar filling the square for places where
 * Scout is the one talking, like Slack (which rounds the corners itself). `theme` picks the logo's version (`blaze`
 * is the app icon); `ground` is Scout's.
 */
export function BrandSquare({
  n,
  who,
  theme,
  ground,
}: {
  n: number;
  who: 'logo' | 'scout' | 'wordmark';
  theme: 'light' | 'dark' | 'blaze';
  ground: ScoutGround;
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
      {who === 'scout' ? <Badge size={n} shape="square" ground={ground} /> : <Logo size={n} theme={theme} />}
    </div>
  );
}
