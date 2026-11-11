import { TAGLINE } from '../content';
import { BannerLand } from './BannerLand';
import { Wordmark } from './Wordmark';

/**
 * card: README banner, social preview and Open Graph, the wordmark large on the left; header: X profile header (the
 * avatar overlaps bottom-left, so the copy sits right). The trail walks across the land to the same orange dot.
 */
export function Banner({
  w,
  h,
  layout,
  wordmark,
  progress,
  wobble,
}: {
  w: number;
  h: number;
  layout: 'card' | 'header';
  wordmark: string;
  /** The scene's animation: how far the trail has walked, and the contours' drift. */
  progress?: number;
  wobble?: number;
}) {
  const u = h / 640;
  return (
    <div
      className={`banner ${layout}`}
      data-capture="banner"
      style={{ width: w, height: h, ['--u' as string]: `${u}px` }}
    >
      <BannerLand w={w} h={h} progress={progress} wobble={wobble} />
      <div className="banner-copy">
        <Wordmark text={wordmark} />
        <div className="social-cat">The trail map for AI coding agents</div>
        <div className="social-tag">{TAGLINE}</div>
      </div>
    </div>
  );
}
