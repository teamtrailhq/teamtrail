/**
 * Framework-free Scout renderer for non-React pages. Same frames, timing, markup and CSS classes as <ScoutAvatar>.
 */
import { type BadgeShape, type ScoutGround, badgeMarkup } from './badgeArt';
import { RECOMMENDED_STYLE, STYLES, TIMING, composeWave } from './frames';
import { caret, createScoutDom, drawBadge, drawWave } from './scoutDom';
import {
  blinks,
  scoutFace,
  scoutLabels,
  scoutLayout,
  REDUCED_QUERY,
  resolveScout,
  SPEECH_STEP_MS,
  SPEECH_TAIL_MS,
  speechDuration,
} from './scoutFrame';
import type { ScoutSize, ScoutState, ScoutStyleId } from './types';
import './ScoutAvatar.css';

export { TIMING } from './frames';
export { type GuideRole, type GuideTheme, guideMarkup } from './guideArt';
export { type ScoutGround } from './badgeArt';
export type { ScoutSize, ScoutState } from './types';

export interface MountScoutOptions {
  state?: ScoutState;
  size?: ScoutSize | number;
  speaking?: string;
  variant?: ScoutStyleId;
  /** The ground behind Scout: `ink` (the default), `blaze` or `paper`. */
  ground?: ScoutGround;
  /** `circle` (the default) or `square`, for a tile or a square frame. */
  shape?: Extract<BadgeShape, 'circle' | 'square'>;
  framed?: boolean;
  caption?: boolean;
  label?: string;
  onSpeakEnd?: () => void;
}

export interface ScoutHandle {
  update(next: Partial<MountScoutOptions>): void;
  destroy(): void;
}

export function mountScout(host: HTMLElement, initial: MountScoutOptions = {}): ScoutHandle {
  let opts: MountScoutOptions = { ...initial };
  const mq = window.matchMedia?.(REDUCED_QUERY);
  let t0 = performance.now();
  let speechDone = false;
  let blinking = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let tick: ReturnType<typeof setInterval> | undefined;
  let blinkTimer: ReturnType<typeof setInterval> | undefined;
  const dom = createScoutDom(host);
  const { root, head, feed, spriteWrap, caption, live } = dom;

  const derive = () => resolveScout(opts, !!mq?.matches);

  const render = () => {
    const d = derive();
    const style = STYLES[opts.variant ?? RECOMMENDED_STYLE];
    const speaking = d.talking && !speechDone;
    const { eyes, mouth, light, cursor } = scoutFace(d, performance.now() - t0, blinking, speaking);
    const { base, px, bars, waveCursor } = scoutLayout(d, cursor);
    const label = opts.label ?? 'Scout';
    const { shownState, status, ariaLabel, showCaption, shown } = scoutLabels(d, {
      label,
      speechDone,
      cursor,
      caption: opts.caption,
    });

    root.style.setProperty('--scout-u', `${base}px`);
    const shape = opts.shape ?? 'circle';
    const badge = badgeMarkup({ eyes, mouth, light }, { lamp: style.lamp, simple: d.mini, ground: opts.ground, shape });
    drawBadge(dom.sprite, badge, px);
    spriteWrap.style.borderRadius = shape === 'square' ? '0' : '';

    if (!d.framed) {
      root.className = `scout scout-bare scout-${shownState}`;
      root.setAttribute('role', 'img');
      root.setAttribute('aria-label', ariaLabel);
      root.replaceChildren(spriteWrap);
      return;
    }
    root.className = `scout scout-panel scout-${shownState} scout-v-${style.id}`;
    root.removeAttribute('role');
    root.removeAttribute('aria-label');
    root.dataset.state = shownState;
    dom.name.textContent = label;
    dom.status.textContent = status;
    feed.setAttribute('aria-label', ariaLabel);
    const heights = speaking ? composeWave(d.text, waveCursor, bars) : null;
    drawWave(dom.wave, { heights, bars, unit: base, colors: style.wave });
    feed.replaceChildren(spriteWrap, dom.wave);

    const children: Node[] = [head, feed];
    if (showCaption) {
      caption.textContent = shown;
      if (speaking && !d.reduced) caption.append(caret());
      children.push(caption);
    }
    if (d.text) {
      if (live.textContent !== d.text) live.textContent = d.text;
      children.push(live);
    }
    root.replaceChildren(...children);
  };

  const stop = () => {
    timers.forEach(clearTimeout);
    timers = [];
    if (tick) clearInterval(tick);
    if (blinkTimer) clearInterval(blinkTimer);
    tick = blinkTimer = undefined;
  };

  const start = () => {
    stop();
    t0 = performance.now();
    speechDone = false;
    blinking = false;
    const d = derive();
    const animate = !d.reduced;
    if (d.talking) {
      timers.push(
        setTimeout(
          () => {
            speechDone = true;
            if (tick) clearInterval(tick);
            tick = undefined;
            render();
            opts.onSpeakEnd?.();
          },
          speechDuration(d.text) + SPEECH_TAIL_MS,
        ),
      );
    }
    if (animate && (d.talking || d.effective === 'thinking')) {
      tick = setInterval(render, d.talking ? SPEECH_STEP_MS : TIMING.thinkingStepMs);
    }
    if (blinks(d, animate)) {
      blinkTimer = setInterval(() => {
        blinking = true;
        render();
        timers.push(
          setTimeout(() => {
            blinking = false;
            render();
          }, TIMING.blinkMs),
        );
      }, TIMING.blinkEveryMs);
    }
    render();
  };

  const onMotion = () => start();
  mq?.addEventListener('change', onMotion);
  start();

  return {
    update(next) {
      opts = { ...opts, ...next };
      start();
    },
    destroy() {
      stop();
      mq?.removeEventListener('change', onMotion);
      host.replaceChildren();
    },
  };
}
