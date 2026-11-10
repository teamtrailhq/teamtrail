import { randomInt, timingSafeEqual } from 'node:crypto';
import type { SlackContext } from './slackContext';

/** How long a code can be entered, and how many wrong tries one Slack account and everyone together get. */
export const CODE_TTL_MS = 10 * 60_000;
const TRIES_PER_USER = 5;
const TRIES_PER_CODE = 20;
/** No 0/O, 1/I/L: the code is read off one screen and typed into another. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

/** The one-time code the trail lead reads in the Lookout and enters in Slack. Kept in memory only. */
export interface OwnerCode {
  code: string;
  expiresAt: number;
  tries: Map<string, number>;
  wrong: number;
}

export type Redeemed = 'ok' | 'wrong' | 'expired' | 'locked';

const now = (ctx: SlackContext) => ctx.o.now?.() ?? Date.now();
const normal = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const shown = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** The code that can be entered right now, if any. */
export function activeCode(ctx: SlackContext): OwnerCode | undefined {
  const c = ctx.ownerCode;
  if (c && c.expiresAt > now(ctx)) return c;
  ctx.ownerCode = undefined;
  return undefined;
}

/** A new code, replacing any earlier one. Only this-machine routes call this. */
export function newCode(ctx: SlackContext) {
  const code = ctx.o.ownerCode?.() ?? random();
  ctx.ownerCode = { code, expiresAt: now(ctx) + CODE_TTL_MS, tries: new Map(), wrong: 0 };
  return { code: shown(code), expiresAt: ctx.ownerCode.expiresAt };
}

function random() {
  let code = '';
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Checks what a Slack account typed, without awaiting anything, so two submissions can't both win. A right code
 * is used up; wrong ones count against the account and against the code, which is dropped after too many.
 */
export function redeemCode(ctx: SlackContext, user: string, input: string): Redeemed {
  const c = activeCode(ctx);
  if (!c) return 'expired';
  const tried = c.tries.get(user) ?? 0;
  if (tried >= TRIES_PER_USER) return 'locked';
  if (same(normal(input), c.code)) {
    ctx.ownerCode = undefined;
    return 'ok';
  }
  c.tries.set(user, tried + 1);
  c.wrong++;
  if (c.wrong >= TRIES_PER_CODE) ctx.ownerCode = undefined;
  return 'wrong';
}
