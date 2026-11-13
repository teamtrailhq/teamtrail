/**
 * Style and timing data. The drawing lives in badgeArt.ts: one portrait with eyes, mouth and antenna lamp that change with the state.
 */
import { type BadgeLamp, LAMP_DAY, LAMP_NIGHT } from './badgeArt';
import type { Eye, Light, ScoutState, ScoutStyleId, Mouth } from './types';

export type { Eye, Light, ScoutState, ScoutStyleId, Mouth } from './types';

export interface ScoutStyle {
  id: ScoutStyleId;
  name: string;
  blurb: string;
  lamp: BadgeLamp;
  wave: { bar: string; lead: string };
}

export const STYLES: Record<ScoutStyleId, ScoutStyle> = {
  crt: {
    id: 'crt',
    name: 'Day',
    blurb: 'Scout looking to the side: a cap, a headset with a mic, an antenna lamp and a neckerchief.',
    lamp: LAMP_DAY,
    wave: { bar: '#6f8a78', lead: '#c8581e' },
  },
  night: {
    id: 'night',
    name: 'Night',
    blurb: 'The same Scout, with the antenna lamp burning brighter, for the night theme.',
    lamp: LAMP_NIGHT,
    wave: { bar: '#66828d', lead: '#e8833a' },
  },
};
export const RECOMMENDED_STYLE: ScoutStyleId = 'crt';

export const EXPRESSIONS: Record<ScoutState, { eyes: Eye; mouth: Mouth; light: Light }> = {
  idle: { eyes: 'open', mouth: 'rest', light: 'on' },
  speaking: { eyes: 'open', mouth: 'rest', light: 'on' },
  thinking: { eyes: 'aside', mouth: 'aside', light: 'dim' },
  alert: { eyes: 'wide', mouth: 'rest', light: 'alert' },
};

export const STATUS_LABEL: Record<ScoutState, string> = {
  idle: 'WATCHING',
  speaking: 'TALKING',
  alert: 'NEEDS YOU',
  thinking: 'THINKING',
};

export const TIMING = {
  msPerChar: 55,
  mouthHoldMs: 110,
  blinkEveryMs: 5600,
  blinkMs: 140,
  /** Thinking: the status light pulses between dim and on at this step. */
  thinkingStepMs: 520,
};

/** Character -> mouth line. Deliberately coarse: vowels lengthen the line, other letters shorten it. */
export function viseme(ch: string | undefined): Mouth {
  if (!ch) return 'rest';
  if (/[aeiouy]/i.test(ch)) return 'open';
  if (/[a-z0-9]/i.test(ch)) return 'mid';
  return 'rest';
}

/** Waveform bar height (0-3) for a character. */
export function amplitude(ch: string | undefined, i: number): number {
  if (!ch || !/[a-z0-9]/i.test(ch)) return 0;
  if (/[aeiou]/i.test(ch)) return 2 + ((ch.charCodeAt(0) + i) % 2);
  return 1 + ((ch.charCodeAt(0) * 7 + i) % 2);
}

/** Waveform heights (0-3), newest sample on the right. `cursor` is the index of the character being spoken. */
export function composeWave(text: string, cursor: number, bars: number): number[] {
  return Array.from({ length: bars }, (_, c) => {
    const i = cursor - (bars - 1 - c);
    return i >= 0 && i < text.length ? amplitude(text[i], i) : 0;
  });
}
