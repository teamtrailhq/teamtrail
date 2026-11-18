import type { ActorKind } from './lifecycle';

/**
 * How a verification gate acts: `off` does nothing, `observe` records what it would have held back and lets the work
 * through, `enforce` holds the work for the human (with a way past it in the Lookout, never a dead end).
 */
export type GateMode = 'off' | 'observe' | 'enforce';

export const GATE_MODES: readonly GateMode[] = ['off', 'observe', 'enforce'];

/**
 * The gates set in verification.json's `gates`:
 * - `check-guard`: the work changed what a check runs (its scripts or config) or skipped or removed tests.
 * - `independent-review`: a review by an agent on the same model as the work's author.
 * - `diff-rules`: a rule whose files the change touched was left unanswered.
 * - `flaky`: a check failed and then passed on the same commit.
 */
export type GateName = 'check-guard' | 'independent-review' | 'diff-rules' | 'flaky';

export const GATE_NAMES: readonly GateName[] = ['check-guard', 'independent-review', 'diff-rules', 'flaky'];

export type GateModes = Record<GateName, GateMode>;

/** Values when verification.json leaves a gate out. */
export const DEFAULT_GATES: GateModes = {
  'check-guard': 'enforce',
  'independent-review': 'observe',
  'diff-rules': 'enforce',
  flaky: 'enforce',
};

/**
 * A gate that held work back (`enforced`) or would have (`observed`), in the trail's journal. Observations are how the
 * trail lead sees what turning a gate on would do before it holds anyone up.
 */
export interface GateEntry {
  v: 1;
  kind: 'gate';
  at: number;
  mapId: string;
  gate: GateName;
  mode: Exclude<GateMode, 'off'>;
  ticketId?: string;
  ticketKey?: string;
  /** What the gate saw, in words: "package.json scripts.test changed". */
  reason: string;
  actor: string;
  actorKind: ActorKind;
}

/** `GET /verification/gates`: what the gates held back or would have, every trail, newest first, the last `days`. */
export interface GateLog {
  since: number;
  days: number;
  entries: GateEntry[];
}
