import { TAGLINE } from '../content';
import { BannerGrid } from './BannerGrid';
import { Wordmark } from './Wordmark';

/**
 * card: README banner, social preview and Open Graph, the wordmark large on the left; header: X profile header (the
 * avatar overlaps bottom-left, so the copy sits right). The trail walks across the dot grid to its blaze destination.
 */
export function Banner({
  w,
  h,
  layout,
  wordmark,
  progress,
}: {
  w: number;
  h: number;
  layout: 'card' | 'header';
  wordmark: string;
  /** The scene's animation: how far the trail has walked. */
  progress?: number;
}) {
  const u = h / 640;
  return (
    <div
      className={`banner ${layout}`}
      data-capture="banner"
      style={{ width: w, height: h, ['--u' as string]: `${u}px` }}
    >
      <BannerGrid w={w} h={h} progress={progress} />
      <div className="banner-copy">
        <Wordmark text={wordmark} />
        <div className="social-cat">The trail map for AI coding agents</div>
        <div className="social-tag">{TAGLINE}</div>
      </div>
    </div>
  );
}
