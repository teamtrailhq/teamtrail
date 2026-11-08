import { Logo, ScoutAvatar, type ScoutState } from '../../src/scout';
import { TAGLINE } from '../content';
import { BannerLand } from './BannerLand';
import { Wordmark } from './Wordmark';

export interface BannerFrame {
  state: ScoutState;
  speaking?: string;
  at: number;
}

/** Scout's height in the animated banner, in 40px units: about the text block beside it, so the name leads. */
const SCOUT_UNITS = 6.5;

/** card: social preview / Open Graph; header: X profile header (avatar overlaps bottom-left, so content sits right).
 * The logo leads; with a `frame` (the animated README banner) Scout's badge takes its place and speaks. */
export function Banner({
  w,
  h,
  layout,
  wordmark,
  frame,
  progress,
  wobble,
}: {
  w: number;
  h: number;
  layout: 'card' | 'header';
  wordmark: string;
  frame?: BannerFrame;
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
      {layout === 'card' ? (
        <div className="banner-feed">
          {frame ? (
            <ScoutAvatar
              framed={false}
              variant="night"
              size={SCOUT_UNITS * u}
              state={frame.state}
              speaking={frame.speaking}
              at={frame.at}
              caption={false}
            />
          ) : (
            <Logo size={Math.round(360 * u)} />
          )}
        </div>
      ) : null}
      <div className="banner-copy">
        <Wordmark text={wordmark} />
        <div className="social-cat">The trail map for AI coding agents</div>
        <div className="social-tag">{TAGLINE}</div>
      </div>
      {layout === 'header' ? (
        <div className="banner-sprite">
          <Logo size={Math.round(h * 0.56)} />
        </div>
      ) : null}
    </div>
  );
}
