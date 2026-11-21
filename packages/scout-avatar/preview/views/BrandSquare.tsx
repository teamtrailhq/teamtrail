import { Badge, Logo, type ScoutGround } from '../../src/scout';
import { WORDMARK } from '../content';
import { Wordmark } from './Wordmark';

/** The wordmark's width in em (the mark, the gap and `teamtrail` in Inter 600), to size it to a share of the square. */
const WORDMARK_EM = 5.04;

/**
 * Brand exports: the logo on transparency, the wordmark on a dark square, or Scout's avatar filling the square for
 * places where Scout is the one talking, like Slack (which rounds the corners itself). `round` sizes the logo for
 * avatars cropped to a circle; `tile` puts it on the near-black square (the opaque app icon); `ground` is Scout's.
 */
export function BrandSquare({
  n,
  who,
  round,
  tile,
  ground,
}: {
  n: number;
  who: 'logo' | 'scout' | 'wordmark';
  round: boolean;
  tile: boolean;
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
    <div
      className={`brand-square${who === 'logo' ? ' logo-square' : ''}`}
      data-capture="square"
      style={{ width: n, height: n }}
    >
      {who === 'scout' ? (
        <Badge size={n} shape="square" ground={ground} />
      ) : (
        <Logo size={n} round={round} tile={tile} />
      )}
    </div>
  );
}
