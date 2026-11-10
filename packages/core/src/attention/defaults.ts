import type { AttentionKind, AttentionPolicy, AttentionPrefs, AttentionState } from '../model/attention';

/**
 * How much each kind counts on its own, 0–100. Work that holds agents or tickets up weighs most;
 * things to look at when convenient weigh least. Teams change these in attention.json.
 */
export const DEFAULT_WEIGHTS: Record<AttentionKind, number> = {
  question: 60,
  blocked: 60,
  reroute: 60,
  brief: 55,
  approval: 50,
  policy: 50,
  integration: 45,
  stalled: 40,
  overlap: 40,
  'hitl-ready': 35,
  flag: 35,
  'reroute-suggested': 30,
  model: 30,
  knowledge: 15,
  guide: 45,
  'guide-checks': 30,
  'tracker-settings': 40,
};

export const ATTENTION_KINDS = Object.keys(DEFAULT_WEIGHTS) as AttentionKind[];

export const DEFAULT_ATTENTION_POLICY: AttentionPolicy = {
  v: 1,
  weights: DEFAULT_WEIGHTS,
  interrupt: 70,
  digestMinutes: 60,
};

export const DEFAULT_ATTENTION_PREFS: AttentionPrefs = { v: 1, channel: 'browser' };

export const EMPTY_ATTENTION_STATE: AttentionState = { v: 1, snoozed: {}, dismissed: [] };

/** The team policy file, in the tracker folder. Also the per-user prefs file name, in the config dir. */
export const ATTENTION_FILE = 'attention.json';
