import { useMemo, type CSSProperties } from 'react';
import { Badge } from './Badge';
import type { ScoutGround } from './badgeArt';
import { RECOMMENDED_STYLE, STYLES, composeWave } from './frames';
import { useBlink } from './hooks/useBlink';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import { useSpeechClock } from './hooks/useSpeechClock';
import { blinks, scoutFace, scoutLabels, scoutLayout, resolveScout } from './scoutFrame';
import type { ScoutSize, ScoutState, ScoutStyleId } from './types';
import { Wave } from './Wave';
import './ScoutAvatar.css';

export type { ScoutSize } from './types';

export interface ScoutAvatarProps {
  state?: ScoutState;
  /** xs: 32px inline badge with the simple drawing; sm/md/lg: framed badge at 80/160/240px. A number sets the size in units of 40px. */
  size?: ScoutSize | number;
  /** Line Scout is saying. Drives mouth, waveform and caption; implies `state="speaking"` unless the state is alert or thinking. */
  speaking?: string;
  variant?: ScoutStyleId;
  /** The ground behind Scout: `ink` (the default), `blaze` or `paper`. */
  ground?: ScoutGround;
  /** Draw the panel frame and label. Defaults to true except for `xs`. */
  framed?: boolean;
  /** Show the spoken line under the waveform. Defaults to true for md and lg. */
  caption?: boolean;
  label?: string;
  /** Fires once the `speaking` line has played out (also under reduced motion, after the same duration). */
  onSpeakEnd?: () => void;
  /** Freeze the clock at this many ms into the current state (previews, screenshots, tests). */
  at?: number;
  className?: string;
  style?: CSSProperties;
}

export function ScoutAvatar({
  state = 'idle',
  size = 'md',
  speaking,
  variant = RECOMMENDED_STYLE,
  ground,
  framed,
  caption,
  label = 'Scout',
  onSpeakEnd,
  at,
  className,
  style: styleProp,
}: ScoutAvatarProps) {
  const m = resolveScout({ state, size, speaking, framed }, usePrefersReducedMotion());
  const { text, effective, talking, reduced } = m;
  const style = STYLES[variant];
  const frozen = at !== undefined;
  const animate = !reduced && !frozen;
  const key = `${effective}|${variant}|${text}`;
  const { t, speechDone } = useSpeechClock({
    key,
    text,
    talking,
    thinking: effective === 'thinking',
    animate,
    at,
    onSpeakEnd,
  });
  const blinking = useBlink(blinks(m, animate));

  const showWave = talking && !speechDone;
  const { eyes, mouth, light, cursor } = scoutFace(m, t, blinking, showWave);
  const { base, px, bars, waveCursor } = scoutLayout(m, cursor);
  const wave = useMemo(
    () => (showWave ? composeWave(text, waveCursor, bars) : null),
    [showWave, text, waveCursor, bars],
  );

  const { shownState, status, ariaLabel, showCaption, shown } = scoutLabels(m, { label, speechDone, cursor, caption });
  const cssVars = {
    ...styleProp,
    ['--scout-u' as string]: `${base}px`,
  } as CSSProperties;

  const sprite = (
    <span className="scout-sprite">
      <Badge face={{ eyes, mouth, light }} variant={variant} size={px} simple={m.mini} ground={ground} />
    </span>
  );

  if (!m.framed) {
    return (
      <span
        className={`scout scout-bare scout-${shownState} ${className ?? ''}`}
        style={cssVars}
        role="img"
        aria-label={ariaLabel}
      >
        {sprite}
      </span>
    );
  }

  return (
    <figure
      className={`scout scout-panel scout-${shownState} scout-v-${variant} ${className ?? ''}`}
      style={cssVars}
      data-state={shownState}
    >
      <figcaption className="scout-head">
        <span className="scout-name">{label}</span>
        <span className="scout-sep">//</span>
        <span className="scout-status">{status}</span>
      </figcaption>
      <div className="scout-feed" role="img" aria-label={ariaLabel}>
        {sprite}
        <Wave heights={wave} bars={bars} unit={base} colors={style.wave} />
      </div>
      {showCaption && (
        <p className="scout-caption" aria-hidden="true">
          {shown}
          {talking && !speechDone && !reduced && <span className="scout-caret">_</span>}
        </p>
      )}
      {text && (
        <span className="scout-sr" aria-live="polite">
          {text}
        </span>
      )}
    </figure>
  );
}

export default ScoutAvatar;
