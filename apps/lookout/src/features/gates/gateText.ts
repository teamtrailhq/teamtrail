import { GATE_NAMES, type GateMode, type GateName } from '@teamtrail/core';

/** What each gate is, in a few words, and what it catches, in one line. */
const GATES: Record<GateName, { title: string; about: string }> = {
  'check-guard': {
    title: 'Check guard',
    about: 'A pass counts only if the work left what the checks run, and its tests, alone.',
  },
  'independent-review': {
    title: 'Independent review',
    about: 'A review by an agent on the same model as the author doesn’t count as independent.',
  },
  'diff-rules': {
    title: 'Diff rules',
    about: 'A change to files a rule covers waits until the rule’s check runs or its question is answered.',
  },
  flaky: {
    title: 'Flaky checks',
    about: 'A check that failed, then passed on the same commit, needs you before the pass counts.',
  },
};

export const isKnownGate = (gate: string): gate is GateName => GATE_NAMES.includes(gate as GateName);

/** A gate's name as Settings shows it; a gate this version doesn't know keeps the name the journal gave it. */
export function gateTitle(gate: string) {
  return isKnownGate(gate) ? GATES[gate].title : gate;
}

/** The one-line description, none for a gate this version doesn't know. */
export function gateAbout(gate: string) {
  return isKnownGate(gate) ? GATES[gate].about : undefined;
}

export const MODE_TEXT: Record<GateMode, { label: string; tip: string }> = {
  off: { label: 'Off', tip: 'Does nothing' },
  observe: { label: 'Observe', tip: 'Notes what it would hold and lets the work through' },
  enforce: { label: 'Enforce', tip: 'Holds the work for you, with a way past it' },
};
